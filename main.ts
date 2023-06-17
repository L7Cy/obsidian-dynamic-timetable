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
    taskEstimateDelimiter: string;
    startTimeDelimiter: string;
    headerNames: string[];
    [key: string]: string | boolean | string[] | null | undefined;
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
        taskEstimateDelimiter: ';',
        startTimeDelimiter: '@',
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
        await this.renderTable(tasks);
    }

    parseTasksFromContent(content: string): Task[] {
        const tasks = this.taskParser.filterAndParseTasks(content);
        return tasks;
    }

    async renderTable(tasks: Task[]): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        const scheduleTable = this.createTable();
        const tableHead = scheduleTable.createTHead();
        const tableBody = scheduleTable.createTBody();

        tableHead.appendChild(this.createTableHeader());
        this.appendTableBodyRows(tableBody, tasks);

        const updateButton = this.createUpdateButton();
        contentEl.appendChild(updateButton);
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

            let backgroundColor: string | null = null;
            if (startTime) {
                if (previousEndTime && new Date(startTime) < previousEndTime) {
                    backgroundColor = "rgba(255, 0, 0, 0.3)";
                } else {
                    backgroundColor = "rgba(0, 255, 0, 0.3)";
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
            tableBody.appendChild(this.createTableRow(tableRowValues, false, backgroundColor));

            if (endTime) {
                previousEndTime = endTime;
                currentTime = endTime;
            }
        }
    }

    private createTableRow(rowValues: string[], isHeader = false, backgroundColor: string | null = null): HTMLTableRowElement {
        const row = document.createElement("tr");
        if (backgroundColor) {
            row.setAttribute("style", `background-color: ${backgroundColor};`);
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

    private createUpdateButton(): HTMLButtonElement {
        const updateButton = this.contentEl.createEl("button", { text: "Update" });
        updateButton.addEventListener("click", async () => {
            await this.update();
            new Notice("Timetable updated!");
        });
        return updateButton;
    }
}

class TaskParser {
    constructor(private separator: string, private startTimeDelimiter: string, private showStartTimeInTaskName: boolean, private showEstimateInTaskName: boolean) { }

    static fromSettings(settings: DynamicTimetableSettings): TaskParser {
        return new TaskParser(settings.taskEstimateDelimiter, settings.startTimeDelimiter, settings.showStartTimeInTaskName, settings.showEstimateInTaskName);
    }

    public filterAndParseTasks(content: string): Task[] {
        const tasks = content.split("\n")
            .map(line => line.trim())
            .filter(line => line.startsWith("- [ ]"))
            .filter(task => task.includes(this.separator) || task.includes(this.startTimeDelimiter))
            .map(task => {
                const taskName = this.parseTaskName(task);
                const startTime = this.parseStartTime(task);
                const estimate = this.parseEstimate(task);
                return {
                    task: taskName,
                    startTime: startTime,
                    estimate: estimate
                };
            });
        return tasks;
    }

    public parseTaskName(taskName: string): string {
        const taskNameRegex = /^-\s*\[\s*.\s*\]\s*/;
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

    public parseStartTime(task: string): Date | null {
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
            const currentTime = new Date();
            const timeSplit = timeMatch[1].split(":").length == 1 ?
                timeMatch[1].length == 3 ? [timeMatch[1].substring(0, 1), timeMatch[1].substring(1, 3)] : [timeMatch[1].substring(0, 2), timeMatch[1].substring(2, 4)] :
                timeMatch[1].split(":");
            const [hours, minutes] = timeSplit.map(Number);
            const startDate = new Date(currentTime.setHours(hours, minutes));
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
        this.createTaskEstimateDelimiterSetting();
        this.createStartTimeDelimiterSetting();

        const defaultHeaderNames = DynamicTimetable.DEFAULT_SETTINGS.headerNames;
        defaultHeaderNames.forEach((defaultHeaderName, index) => {
            const headerName = this.plugin.settings.headerNames[index] || defaultHeaderName;
            this.createHeaderNameSetting(headerName, index);
        });
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
}
