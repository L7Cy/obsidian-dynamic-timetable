import { Plugin, WorkspaceLeaf, ItemView, App, TFile, PluginSettingTab, Setting, Notice } from "obsidian";

interface Task {
    task: string;
    startTime: Date | null;
    estimate: string | null;
}

interface DynamicTimetableSettings {
    filePath: string | null;
    showEstimate: boolean;
    showStartTime: boolean;
    showEstimateInTaskName: boolean;
    showStartTimeInTaskName: boolean;
    showBufferTime: boolean;
    showProgressBar: boolean;
    intervalTime: number;
    taskEstimateDelimiter: string;
    startTimeDelimiter: string;
    headerNames: string[];
    dateDelimiter: string;
    enableOverdueNotice: boolean;
    [key: string]: string | boolean | string[] | number | null | undefined;
}

declare module "obsidian" {
    interface Workspace {
        on(eventName: "layout-ready", callback: () => any, ctx?: any): EventRef;
    }
}

export default class DynamicTimetable extends Plugin {
    settings: DynamicTimetableSettings;
    targetFile: TFile | null = null;

    static DEFAULT_SETTINGS: DynamicTimetableSettings = {
        filePath: null,
        showEstimate: false,
        showStartTime: false,
        showEstimateInTaskName: false,
        showStartTimeInTaskName: true,
        showBufferTime: true,
        showProgressBar: true,
        intervalTime: 1,
        taskEstimateDelimiter: ';',
        startTimeDelimiter: '@',
        dateDelimiter: "^---$",
        enableOverdueNotice: true,
        headerNames: ['Tasks', 'Estimate', 'Start', 'End'],
    };

    async onload() {
        console.log("DynamicTimetable: onload");

        this.settings = { ...DynamicTimetable.DEFAULT_SETTINGS, ...await this.loadData() };
        this.addSettingTab(new DynamicTimetableSettingTab(this.app, this));

        this.registerCommands();
        this.registerView("Timetable", (leaf: WorkspaceLeaf) => new TimetableView(leaf, this));

        if (this.app.workspace.layoutReady) {
            this.initTimetableView();
        } else {
            this.registerEvent(
                this.app.workspace.on("layout-ready", this.initTimetableView.bind(this))
            );
        }
    }

    onunload(): void {
        this.closeTimetable();
    }

    async updateSetting<T extends keyof DynamicTimetableSettings>(
        settingName: T,
        newValue: DynamicTimetableSettings[T]
    ): Promise<void> {
        this.settings[settingName] = newValue;
        await this.saveData(this.settings);
        await this.updateOpenTimetableViews();
    }

    private registerCommands(): void {
        this.addToggleTimetableCommand();
        this.addInitTimetableCommand();
    }

    private addToggleTimetableCommand(): void {
        this.addCommand({
            id: "toggle-timetable",
            name: "Show/Hide Timetable",
            callback: () => {
                if (this.isTimetableOpen()) {
                    this.closeTimetable();
                } else {
                    this.openTimetable();
                }
            }
        });
    }

    private addInitTimetableCommand(): void {
        this.addCommand({
            id: 'init-timetable',
            name: 'Initialize Timetable',
            callback: () => this.initTimetableView()
        });
    }

    async initTimetableView() {
        if (!this.isTimetableOpen()) {
            this.openTimetable();
        } else {
            this.updateOpenTimetableViews();
        }
    }

    async updateOpenTimetableViews() {
        for (let leaf of this.app.workspace.getLeavesOfType("Timetable")) {
            let view = leaf.view;
            if (view instanceof TimetableView) {
                this.checkTargetFile();
                await view.update();
            }
        }
    }

    isTimetableOpen(): boolean {
        return this.app.workspace.getLeavesOfType("Timetable").length > 0;
    }

    async openTimetable() {
        this.checkTargetFile();
        const leaf = this.app.workspace.getRightLeaf(false);
        leaf.setViewState({ type: "Timetable" });
        this.app.workspace.revealLeaf(leaf);
    }

    closeTimetable() {
        this.app.workspace.detachLeavesOfType("Timetable");
    }

    checkTargetFile() {
        const abstractFile = this.settings.filePath
            ? this.app.vault.getAbstractFileByPath(this.settings.filePath)
            : this.app.workspace.getActiveFile();

        if (abstractFile instanceof TFile) {
            this.targetFile = abstractFile;
        } else {
            this.targetFile = null;
            new Notice("No active file or active file is not a Markdown file");
        }
    }
}

class TimetableView extends ItemView {
    private taskParser: TaskParser;
    private intervalId: ReturnType<typeof setInterval> | undefined;
    private overdueNotice: Notice | null = null;

    private static readonly MILLISECONDS_IN_MINUTE = 60000;
    private static readonly LATE_CLASS = "late";
    private static readonly ON_TIME_CLASS = "on-time";
    private static readonly BUFFER_TIME_CLASS = "dt-buffer-time";
    private static readonly BUFFER_TIME_NAME = "Buffer Time";
    private static readonly PROGRESS_BAR_CLASS = 'dt-progress-bar';
    private static readonly PROGRESS_BAR_OVERDUE_CLASS = 'dt-progress-bar-overdue';
    private static readonly INIT_BUTTON_TEXT = "Init";

    constructor(leaf: WorkspaceLeaf, private readonly plugin: DynamicTimetable) {
        super(leaf);
        this.containerEl.addClass("Timetable");

        plugin.registerEvent(this.app.vault.on("modify", async (file) => {
            if (file === this.plugin.targetFile) {
                this.update();
            }
        }));
    }

    getViewType(): string {
        return "Timetable";
    }

    getDisplayText(): string {
        return "Timetable";
    }

    async onOpen(): Promise<void> {
        await this.update();
    }

    async onClose(): Promise<void> {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        if (this.overdueNotice) {
            this.overdueNotice.hide();
            this.overdueNotice = null;
        }
    }

    async update() {
        if (!this.plugin.targetFile) {
            return;
        }
        const content = await this.app.vault.cachedRead(this.plugin.targetFile);
        this.taskParser = TaskParser.fromSettings(this.plugin.settings);
        const tasks = this.taskParser.filterAndParseTasks(content);
        const topTaskEstimate = tasks[0] ? (Number(tasks[0].estimate) * 60) || 0 : 0;
        await this.renderTable(tasks);
        if (this.intervalId) {
            clearInterval(this.intervalId);
            if (this.overdueNotice) {
                this.overdueNotice.hide();
                this.overdueNotice = null;
            }
        }
        this.intervalId = setInterval(() => {
            const duration = this.plugin.targetFile ? (new Date().getTime() - this.plugin.targetFile.stat.mtime) / 1000 : 0;
            this.createOrUpdateProgressBar(duration, topTaskEstimate);
        }, this.plugin.settings.intervalTime * 1000);
    }

    async renderTable(tasks: Task[]): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        if (this.plugin.settings.showProgressBar) {
            this.createOrUpdateProgressBar(0, 0);
        }

        const scheduleTable = this.createTable();
        const tableHead = scheduleTable.createTHead();
        const tableBody = scheduleTable.createTBody();

        tableHead.appendChild(this.createTableHeader());
        this.appendTableBodyRows(tableBody, tasks);

        const initButton = this.createInitButton();
        contentEl.appendChild(initButton);
        contentEl.appendChild(scheduleTable);
    }

    private createTable(): HTMLTableElement {
        return this.contentEl.createEl("table");
    }

    private createTableHeader(): HTMLTableRowElement {
        const { headerNames, showEstimate, showStartTime } = this.plugin.settings;
        const [taskHeaderName, estimateHeaderName, startTimeHeaderName, endHeaderName] = headerNames;

        const tableHeaderValues = [taskHeaderName];
        if (showEstimate) {
            tableHeaderValues.push(estimateHeaderName);
        }
        if (showStartTime) {
            tableHeaderValues.push(startTimeHeaderName);
        }
        tableHeaderValues.push(endHeaderName);
        return this.createTableRow(tableHeaderValues, true);
    }

    private appendTableBodyRows(tableBody: HTMLTableSectionElement, tasks: Task[]): void {
        const { showEstimate, showStartTime } = this.plugin.settings;

        let currentTime = new Date();
        let previousEndTime: Date | null = null;

        for (let task of tasks) {
            const { task: parsedTaskName, startTime, estimate } = task;
            const minutes = estimate ? parseInt(estimate) : null;
            if (startTime) {
                currentTime = new Date(startTime);
            } else if (previousEndTime) {
                currentTime = previousEndTime;
            }

            const endTime = minutes ? new Date(currentTime.getTime() + minutes * TimetableView.MILLISECONDS_IN_MINUTE) : null;

            if (this.plugin.settings.showBufferTime && startTime && previousEndTime) {
                const bufferMinutes = Math.floor((new Date(startTime).getTime() - previousEndTime.getTime()) / TimetableView.MILLISECONDS_IN_MINUTE);
                tableBody.appendChild(this.createBufferRow(bufferMinutes));
            }

            const rowClass = startTime ? (previousEndTime && new Date(startTime) < previousEndTime) ? TimetableView.LATE_CLASS : TimetableView.ON_TIME_CLASS : null;

            const tableRowValues = [parsedTaskName];
            if (showEstimate && estimate) {
                tableRowValues.push(`${estimate}m`);
            }
            if (showStartTime) {
                tableRowValues.push(this.formatTime(currentTime));
            }
            if (endTime) {
                tableRowValues.push(this.formatTime(endTime));
            }
            tableBody.appendChild(this.createTableRow(tableRowValues, false, rowClass));

            if (endTime) {
                previousEndTime = endTime;
                currentTime = endTime;
            }
        }
    }

    private createTableCell(value: string, isHeader = false): HTMLElement {
        const cell = document.createElement(isHeader ? "th" : "td");
        cell.textContent = value;
        return cell;
    }

    private createTableRow(rowValues: string[], isHeader = false, rowClass: string | null = null): HTMLTableRowElement {
        const row = document.createElement("tr");
        if (rowClass) {
            row.classList.add(rowClass);
        }
        rowValues.forEach((value) => {
            const cell = this.createTableCell(value, isHeader);
            row.appendChild(cell);
        });
        return row;
    }

    private createBufferRow(bufferMinutes: number): HTMLTableRowElement {
        const bufferRow = document.createElement("tr");
        bufferRow.classList.add(TimetableView.BUFFER_TIME_CLASS);
        const bufferNameCell = this.createTableCell(TimetableView.BUFFER_TIME_NAME);
        bufferRow.appendChild(bufferNameCell);
        const bufferTimeCell = document.createElement("td");
        bufferTimeCell.textContent = `${bufferMinutes}m`;
        bufferTimeCell.setAttribute("colspan", "3");
        bufferRow.appendChild(bufferTimeCell);
        return bufferRow;
    }

    private formatTime(date: Date): string {
        return new Intl.DateTimeFormat(navigator.language, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    }

    private createInitButton(): HTMLButtonElement {
        const initButton = this.contentEl.createEl("button", { text: TimetableView.INIT_BUTTON_TEXT });
        initButton.addEventListener("click", async () => {
            await this.plugin.initTimetableView();
            new Notice("Timetable initialized!");
        });
        return initButton;
    }

    private createOrUpdateProgressBar(duration: number, estimate: number): void {
        let progressBar = this.contentEl.querySelector('.' + TimetableView.PROGRESS_BAR_CLASS) as HTMLElement;
        if (!progressBar) {
            progressBar = this.contentEl.createEl('div');
            progressBar.addClass(TimetableView.PROGRESS_BAR_CLASS);
        }
        const width = Math.min((duration / estimate) * 100, 100);
        progressBar.style.width = width + '%';
        if (width === 100 && !this.overdueNotice && this.plugin.settings.enableOverdueNotice) {
            progressBar.addClass(TimetableView.PROGRESS_BAR_OVERDUE_CLASS);
            this.overdueNotice = new Notice('Are you finished?', 0);
        } else if (width < 100) {
            progressBar.removeClass(TimetableView.PROGRESS_BAR_OVERDUE_CLASS);
            if (this.overdueNotice) {
                this.overdueNotice.hide();
                this.overdueNotice = null;
            }
        }
    }
}

class TaskParser {
    private static readonly TASK_NAME_REGEX = /^[-+*]\s*\[\s*.\s*\]/;
    private static readonly LINK_REGEX = /\[\[([^\[\]]*\|)?([^\[\]]+)\]\]/g;
    private static readonly MARKDOWN_LINK_REGEX = /\[([^\[\]]+)\]\(.+?\)/g;

    private taskNameRegex: RegExp;
    private linkRegex: RegExp;
    private markdownLinkRegex: RegExp;
    private estimateRegex: RegExp;
    private timeRegex: RegExp;
    private dateTimeRegex: RegExp;

    constructor(private separator: string, private startTimeDelimiter: string, private dateDelimiter: RegExp, private showStartTimeInTaskName: boolean, private showEstimateInTaskName: boolean) {
        this.taskNameRegex = TaskParser.TASK_NAME_REGEX;
        this.linkRegex = TaskParser.LINK_REGEX;
        this.markdownLinkRegex = TaskParser.MARKDOWN_LINK_REGEX;
        this.estimateRegex = new RegExp(`\\${separator}\\s*\\d+\\s*`);
        this.timeRegex = new RegExp(`\\${startTimeDelimiter}\\s*(\\d{1,2}\\:?\\d{2})`);
        this.dateTimeRegex = new RegExp(`\\${startTimeDelimiter}\\s*(\\d{4}-\\d{2}-\\d{2}T\\d{1,2}\\:?\\d{2})`);
    }

    static fromSettings(settings: DynamicTimetableSettings): TaskParser {
        return new TaskParser(settings.taskEstimateDelimiter, settings.startTimeDelimiter, new RegExp(settings.dateDelimiter), settings.showStartTimeInTaskName, settings.showEstimateInTaskName);
    }

    public filterAndParseTasks(content: string): Task[] {
        const lines = content.split("\n").map(line => line.trim());
        let currentDate = new Date();
        let nextDay = 0;

        const tasks = lines.flatMap(line => {
            if (new RegExp(this.dateDelimiter).test(line)) {
                nextDay += 1;
                return [];
            }

            if (!line.startsWith("- [ ]") && !line.startsWith("+ [ ]") && !line.startsWith("* [ ]")) {
                return [];
            }

            if (!line.includes(this.separator) && !line.includes(this.startTimeDelimiter)) {
                return [];
            }

            const taskName = this.parseTaskName(line);
            const startTime = this.parseStartTime(line, currentDate, nextDay);
            const estimate = this.parseEstimate(line);

            return {
                task: taskName,
                startTime: startTime,
                estimate: estimate
            };
        });

        return tasks;
    }

    public parseTaskName(taskName: string): string {
        taskName = taskName
            .replace(this.taskNameRegex, "")
            .trim()
            .replace(this.linkRegex, "$2")
            .replace(this.markdownLinkRegex, "$1")
            .trim();

        const startTimeRegex = new RegExp(`\\${this.startTimeDelimiter}\\s*(?:\\d{4}-\\d{2}-\\d{2}T)?(\\d{1,2}\\:?\\d{2})`);

        if (this.showStartTimeInTaskName) {
            taskName = taskName.replace(startTimeRegex, (match, p1) => `${this.startTimeDelimiter}${p1}`);
        } else {
            taskName = taskName.replace(startTimeRegex, "").trim();
        }

        if (!this.showEstimateInTaskName) {
            taskName = taskName.replace(this.estimateRegex, "").trim();
        }

        return taskName;
    }

    public parseStartTime(task: string, currentDate: Date, nextDay: number): Date | null {
        const timeMatch = task.match(this.timeRegex);
        const dateTimeMatch = task.match(this.dateTimeRegex);

        if (dateTimeMatch) {
            const parsedDateTime = new Date(dateTimeMatch[1]);
            if (!isNaN(parsedDateTime.getTime())) {
                return parsedDateTime;
            }
        } else if (timeMatch) {
            const timeSplit = timeMatch[1].split(":").length == 1 ?
                timeMatch[1].length == 3 ? [timeMatch[1].substring(0, 1), timeMatch[1].substring(1, 3)] : [timeMatch[1].substring(0, 2), timeMatch[1].substring(2, 4)] :
                timeMatch[1].split(":");
            const [hours, minutes] = timeSplit.map(Number);

            let startDate = new Date(currentDate.getTime());
            startDate.setDate(startDate.getDate() + nextDay);
            startDate.setHours(hours, minutes, 0, 0);

            return startDate;
        }

        return null;
    }

    public parseEstimate(task: string): string | null {
        const regex = new RegExp(`\\${this.separator}\\s*(\\d+)\\s*`);
        const match = task.match(regex);
        return match ? match[1] : null;
    }
}

class DynamicTimetableSettingTab extends PluginSettingTab {
    plugin: DynamicTimetable;

    constructor(app: App, plugin: DynamicTimetable) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        this.containerEl.empty();

        this.createSetting('File Path', 'Enter the path to the Markdown file to get task list from. Leave blank to use active file.', 'filePath', 'text', '/path/to/target/file.md');
        this.createSetting('Show Estimate Column', '', 'showEstimate', 'toggle');
        this.createSetting('Show Start Time Column', '', 'showStartTime', 'toggle');
        this.createSetting('Show Estimate in Task Name', '', 'showEstimateInTaskName', 'toggle');
        this.createSetting('Show Start Time in Task Name', '', 'showStartTimeInTaskName', 'toggle');
        this.createSetting('Show Buffer Time Rows', '', 'showBufferTime', 'toggle');
        this.createSetting('Task/Estimate Delimiter', '', 'taskEstimateDelimiter', 'text', ';');
        this.createSetting('Start Time Delimiter', '', 'startTimeDelimiter', 'text', '@');

        const headerNames = this.plugin.settings.headerNames.join(', ');
        this.createSetting('Header Names', 'Enter header names, separated by commas.', 'headerNames', 'text', headerNames);

        this.createSetting('Show Progress Bar', 'If enabled, displays a progress bar based on the top task estimate.', 'showProgressBar', 'toggle');
        if (this.plugin.settings.showProgressBar) {
            this.createSetting('Interval Time (Seconds)', 'Set the interval for updating the progress bar.', 'intervalTime', 'text', '1');
        }
        this.createSetting('Date Delimiter', 'Enter a regex that matches the delimiter for a new day.', 'dateDelimiter', 'text', '^---$');
        this.createSetting('Enable Overdue Notice', '', 'enableOverdueNotice', 'toggle');
    }

    /**
 * Creates a new setting with the given parameters.
 * @param {string} name - The name of the setting.
 * @param {string} desc - The description of the setting.
 * @param {string} key - The key for the setting.
 * @param {'text' | 'toggle'} type - The type of the setting.
 * @param {string} [placeholder] - The placeholder for the setting.
 */
    createSetting(name: string, desc: string, key: string, type: 'text' | 'toggle', placeholder?: string) {
        if (key === 'headerNames') {
            this.createHeaderNamesSetting(placeholder || '');
            return;
        }

        if (type === 'text') {
            this.createTextSetting(name, desc, key, placeholder);
        } else if (type === 'toggle') {
            this.createToggleSetting(name, desc, key);
        }
    }

    createTextSetting(name: string, desc: string, key: string, placeholder?: string) {
        const setting = new Setting(this.containerEl).setName(name).setDesc(desc);
        setting.addText(text => {
            const el = text
                .setPlaceholder(placeholder || '')
                .setValue((this.plugin.settings[key] as string) || '');
            el.inputEl.addEventListener('blur', async (event) => {
                const value = (event.target as HTMLInputElement).value;
                await this.plugin.updateSetting(key, value);
            });
            return el;
        });
    }

    createToggleSetting(name: string, desc: string, key: string) {
        const setting = new Setting(this.containerEl).setName(name).setDesc(desc);
        setting.addToggle(toggle =>
            toggle.setValue(!!(this.plugin.settings[key] as boolean))
                .onChange(async (value) => {
                    await this.plugin.updateSetting(key, value);
                    this.display();
                })
        );
    }

    createHeaderNamesSetting(headerNames: string) {
        new Setting(this.containerEl)
            .setName('Header Names')
            .addText(text => {
                const el = text.setValue(headerNames);
                el.inputEl.style.width = '90%';
                el.inputEl.addEventListener('blur', async (event) => {
                    const value = (event.target as HTMLInputElement).value.split(',').map(s => s.trim());
                    await this.plugin.updateSetting("headerNames", value);
                    this.display();
                });
                return el;
            });
    }
}
