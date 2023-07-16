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
        headerNames: ['Tasks', 'Estimate', 'Start', 'End'],
    };

    onunload(): void {
        this.closeTimetable();
    }

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

    constructor(leaf: WorkspaceLeaf, private readonly plugin: DynamicTimetable) {
        super(leaf);
        this.containerEl.addClass("Timetable");
        this.taskParser = TaskParser.fromSettings(this.plugin.settings);

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
        // Do nothing
    }

    async update() {
        if (!this.plugin.targetFile) {
            return;
        }
        const content = await this.app.vault.cachedRead(this.plugin.targetFile);
        const tasks = this.parseTasksFromContent(content);
        const topTaskEstimate = tasks[0] ? (Number(tasks[0].estimate) * 60) || 0 : 0;
        await this.renderTable(tasks);
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.intervalId = setInterval(() => {
            const duration = this.plugin.targetFile ? (new Date().getTime() - this.plugin.targetFile.stat.mtime) / 1000 : 0;
            this.updateProgressBar(duration, topTaskEstimate);
        }, this.plugin.settings.intervalTime * 1000);
    }

    parseTasksFromContent(content: string): Task[] {
        const tasks = this.taskParser.filterAndParseTasks(content);
        return tasks;
    }

    async renderTable(tasks: Task[]): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        if (this.plugin.settings.showProgressBar) {
            const progressBar = this.createProgressBar();
            contentEl.appendChild(progressBar);
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
        const MILLISECONDS_IN_MINUTE = 60000;

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

            const endTime = minutes ? new Date(currentTime.getTime() + minutes * MILLISECONDS_IN_MINUTE) : null;

            if (this.plugin.settings.showBufferTime && startTime && previousEndTime) {
                const bufferMinutes = Math.floor((new Date(startTime).getTime() - previousEndTime.getTime()) / MILLISECONDS_IN_MINUTE);
                const bufferRow = document.createElement("tr");
                bufferRow.classList.add("dt-buffer-time");
                const bufferNameCell = document.createElement("td");
                bufferNameCell.textContent = "Buffer Time";
                bufferRow.appendChild(bufferNameCell);
                const bufferTimeCell = document.createElement("td");
                bufferTimeCell.textContent = `${bufferMinutes}m`;
                bufferTimeCell.setAttribute("colspan", "3");
                bufferRow.appendChild(bufferTimeCell);
                tableBody.appendChild(bufferRow);
            }

            let rowClass = null;
            if (startTime) {
                if (previousEndTime && new Date(startTime) < previousEndTime) {
                    rowClass = "late";
                } else {
                    rowClass = "on-time";
                }
            }

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

    private createTableRow(rowValues: string[], isHeader = false, rowClass: string | null = null): HTMLTableRowElement {
        const row = document.createElement("tr");
        if (rowClass) {
            row.classList.add(rowClass);
        }
        rowValues.forEach((value) => {
            const cell = document.createElement(isHeader ? "th" : "td");
            cell.textContent = value;
            row.appendChild(cell);
        });
        return row;
    }

    private formatTime(date: Date): string {
        return new Intl.DateTimeFormat(navigator.language, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    }

    private createInitButton(): HTMLButtonElement {
        const initButton = this.contentEl.createEl("button", { text: "Init" });
        initButton.addEventListener("click", async () => {
            await this.plugin.initTimetableView();
            new Notice("Timetable initialized!");
        });
        return initButton;
    }

    private createProgressBar(): HTMLDivElement {
        const progressBar = this.contentEl.createEl('div');
        progressBar.addClass('dt-progress-bar');
        return progressBar;
    }

    updateProgressBar(duration: number, estimate: number): void {
        const progressBar = this.contentEl.querySelector('.dt-progress-bar') as HTMLElement;
        if (!progressBar) return;
        const width = Math.min((duration / estimate) * 100, 100);
        progressBar.style.width = width + '%';
        if (duration > estimate) {
            progressBar.addClass('dt-progress-bar-overdue');
        } else {
            progressBar.removeClass('dt-progress-bar-overdue');
        }
    }
}

class TaskParser {
    constructor(private separator: string, private startTimeDelimiter: string, private dateDelimiter: RegExp, private showStartTimeInTaskName: boolean, private showEstimateInTaskName: boolean) { }

    static fromSettings(settings: DynamicTimetableSettings): TaskParser {
        return new TaskParser(settings.taskEstimateDelimiter, settings.startTimeDelimiter, new RegExp(settings.dateDelimiter), settings.showStartTimeInTaskName, settings.showEstimateInTaskName);
    }

    public filterAndParseTasks(content: string): Task[] {
        const lines = content.split("\n").map(line => line.trim());
        let currentDate = new Date();
        let nextDay = false;

        const tasks = lines.flatMap(line => {
            if (new RegExp(this.dateDelimiter).test(line)) {
                nextDay = true;
                currentDate.setDate(currentDate.getDate() + 1);
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

            if (startTime) {
                currentDate = new Date(startTime);
                nextDay = false;
            }

            return {
                task: taskName,
                startTime: startTime,
                estimate: estimate
            };
        });

        return tasks;
    }

    public parseTaskName(taskName: string): string {
        const taskNameRegex = /^[-+*]\s*\[\s*.\s*\]\s*/;
        const linkRegex = /\[\[([^\[\]]*\|)?([^\[\]]+)\]\]/g;
        const markdownLinkRegex = /\[([^\[\]]+)\]\(.+?\)/g;

        taskName = taskName
            .replace(taskNameRegex, "")
            .trim()
            .replace(linkRegex, "$2")
            .replace(markdownLinkRegex, "$1")
            .trim();

        const startTimeRegex = new RegExp(`\\${this.startTimeDelimiter}\\s*(?:\\d{4}-\\d{2}-\\d{2}T)?(\\d{1,2}\\:?\\d{2})`);

        if (this.showStartTimeInTaskName) {
            taskName = taskName.replace(startTimeRegex, (match, p1) => `${this.startTimeDelimiter}${p1}`);
        } else {
            taskName = taskName.replace(startTimeRegex, "").trim();
        }

        if (!this.showEstimateInTaskName) {
            const estimateRegex = new RegExp(`\\${this.separator}\\s*\\d+\\s*`);
            taskName = taskName.replace(estimateRegex, "").trim();
        }

        return taskName;
    }

    public parseStartTime(task: string, currentDate: Date, nextDay: boolean): Date | null {
        const timeRegex = new RegExp(`\\${this.startTimeDelimiter}\\s*(\\d{1,2}\\:?\\d{2})`);
        const dateTimeRegex = new RegExp(`\\${this.startTimeDelimiter}\\s*(\\d{4}-\\d{2}-\\d{2}T\\d{1,2}\\:?\\d{2})`);

        const timeMatch = task.match(timeRegex);
        const dateTimeMatch = task.match(dateTimeRegex);

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
            if (nextDay) {
                startDate.setDate(startDate.getDate() + 1);
            }
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

        this.createFilePathSetting();
        this.createShowEstimateSetting();
        this.createShowStartTimeSetting();
        this.createShowEstimateInTaskNameSetting();
        this.createShowStartTimeInTaskNameSetting();
        this.createShowBufferTimeSetting();
        this.createTaskEstimateDelimiterSetting();
        this.createStartTimeDelimiterSetting();

        const defaultHeaderNames = DynamicTimetable.DEFAULT_SETTINGS.headerNames;
        defaultHeaderNames.forEach((defaultHeaderName, index) => {
            const headerName = this.plugin.settings.headerNames[index] || defaultHeaderName;
            this.createHeaderNameSetting(headerName, index);
        });

        this.createShowProgressBarSetting();

        if (this.plugin.settings.showProgressBar) {
            this.createIntervalTimeSetting();
        }
        this.createDateDelimiterSetting();
    }

    private createFilePathSetting(): Setting {
        const filePathSetting = new Setting(this.containerEl)
            .setName("File Path")
            .setDesc(
                "Enter the path to the Markdown file to get task list from. Leave blank to use active file."
            )
            .addText((text) => {
                const el = text
                    .setPlaceholder("/path/to/target/file.md")
                    .setValue(this.plugin.settings.filePath || "");
                el.inputEl.addEventListener("change", this.onFilePathChange.bind(this));
                return el;
            });

        return filePathSetting;
    }

    private createShowEstimateSetting(): Setting {
        const showEstimateSetting = new Setting(this.containerEl)
            .setName("Show Estimate Column")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showEstimate)
                    .onChange(async (value) => {
                        await this.updateSetting("showEstimate", value);
                    })
            );

        return showEstimateSetting;
    }

    private createShowStartTimeSetting(): Setting {
        const showStartTimeSetting = new Setting(this.containerEl)
            .setName("Show Start Time Column")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showStartTime)
                    .onChange(async (value) => {
                        await this.updateSetting("showStartTime", value);
                    })
            );

        return showStartTimeSetting;
    }

    private createShowEstimateInTaskNameSetting(): Setting {
        const showEstimateInTaskNameSetting = new Setting(this.containerEl)
            .setName("Show estimate in task name")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.showEstimateInTaskName).onChange(async (value) => {
                    this.plugin.settings.showEstimateInTaskName = value;
                    await this.updateSetting("showEstimateInTaskName", value);
                })
            );

        return showEstimateInTaskNameSetting;
    }

    private createShowStartTimeInTaskNameSetting(): Setting {
        const showStartInTaskNameSetting = new Setting(this.containerEl)
            .setName("Show start time in task name")
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.showStartTimeInTaskName).onChange(async (value) => {
                    this.plugin.settings.showStartTimeInTaskName = value;
                    await this.updateSetting("showStartInTaskName", value);
                })
            );

        return showStartInTaskNameSetting;
    }

    private createShowBufferTimeSetting(): Setting {
        const showBufferTimeSetting = new Setting(this.containerEl)
            .setName("Show Buffer Time Rows")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showBufferTime)
                    .onChange(async (value) => {
                        await this.updateSetting("showBufferTime", value);
                    })
            );

        return showBufferTimeSetting;
    }

    private createTaskEstimateDelimiterSetting(): Setting {
        const taskEstimateDelimiterSetting = new Setting(this.containerEl)
            .setName("Task/Estimate Delimiter")
            .addText((text) => {
                const el = text
                    .setPlaceholder(";")
                    .setValue(this.plugin.settings.taskEstimateDelimiter);
                el.inputEl.addEventListener("change", async (ev) => {
                    if (!(ev.target instanceof HTMLInputElement)) {
                        return;
                    }
                    const value = ev.target.value.trim();
                    await this.updateSetting("taskEstimateDelimiter", value);
                });
                return el;
            });

        return taskEstimateDelimiterSetting;
    }

    private createStartTimeDelimiterSetting(): Setting {
        const startTimeDelimiterSetting = new Setting(this.containerEl)
            .setName("Start Time Delimiter")
            .addText((text) => {
                const el = text
                    .setPlaceholder("@")
                    .setValue(this.plugin.settings.startTimeDelimiter);
                el.inputEl.addEventListener("change", async (ev) => {
                    if (!(ev.target instanceof HTMLInputElement)) {
                        return;
                    }
                    const value = ev.target.value.trim();
                    await this.updateSetting("startTimeDelimiter", value);
                });
                return el;
            });

        return startTimeDelimiterSetting;
    }

    private createHeaderNameSetting(headerName: string, index: number): Setting {
        const headerNameSetting = new Setting(this.containerEl)
            .setName(`Header Name ${index + 1}`)
            .addText((text) =>
                text
                    .setValue(headerName)
                    .onChange(async (value) => {
                        const headerNames = [...this.plugin.settings.headerNames];
                        headerNames[index] = value;
                        await this.updateSetting("headerNames", headerNames);
                    })
            );

        return headerNameSetting;
    }

    private async onFilePathChange(ev: Event): Promise<void> {
        if (!(ev.target instanceof HTMLInputElement)) {
            return;
        }
        const value = ev.target.value.trim();
        return this.updateSetting("filePath", value);
    }

    private async updateSetting<T extends keyof DynamicTimetableSettings>(
        settingName: T,
        newValue: DynamicTimetableSettings[T]
    ): Promise<void> {
        this.plugin.settings[settingName] = newValue;
        await this.plugin.saveData(this.plugin.settings);

        for (let leaf of this.plugin.app.workspace.getLeavesOfType("Timetable")) {
            let view = leaf.view;
            if (view instanceof TimetableView) {
                await view.update();
            }
        }
    }

    createShowProgressBarSetting() {
        const showProgressBarSetting = new Setting(this.containerEl)
            .setName('Show progress bar')
            .setDesc('If enabled, displays a progress bar based on the top task estimate.')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.showProgressBar)
                    .onChange(async value => {
                        this.plugin.settings.showProgressBar = value;
                        await this.updateSetting("showProgressBar", value);
                        this.display();
                    })
            );
        return showProgressBarSetting;
    }

    private createIntervalTimeSetting(): Setting {
        const intervalTimeSetting = new Setting(this.containerEl)
            .setName("Interval Time (seconds)")
            .addText((text) => {
                const el = text
                    .setPlaceholder("1")
                    .setValue(this.plugin.settings.intervalTime.toString())
                    .onChange(async (value) => {
                        const numValue = Number(value);
                        if (!isNaN(numValue) && numValue > 0) {
                            await this.updateSetting("intervalTime", numValue);
                        }
                    });
                return el;
            });
        return intervalTimeSetting;
    }

    private createDateDelimiterSetting(): Setting {
        const dateDelimiterSetting = new Setting(this.containerEl)
            .setName("Date Delimiter")
            .setDesc("Enter a regex that matches the delimiter for a new day.")
            .addText((text) => {
                const el = text
                    .setPlaceholder("^---$")
                    .setValue(this.plugin.settings.dateDelimiter || "");
                el.inputEl.addEventListener("change", async (ev) => {
                    if (!(ev.target instanceof HTMLInputElement)) {
                        return;
                    }
                    const value = ev.target.value.trim();
                    await this.updateSetting("dateDelimiter", value);
                });
                return el;
            });

        return dateDelimiterSetting;
    }
}
