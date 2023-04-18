import { Plugin, WorkspaceLeaf, ItemView, App, TFile, PluginSettingTab, Setting, Notice } from "obsidian";

interface Task {
    task: string;
    startTime: Date | null;
    estimate: string | null;
}

interface DynamicTimetableSettings {
    filePath: string | null;
    showEstimate: boolean;
    taskEstimateDelimiter: string;
    startTimeDelimiter: string;
    headerNames: string[];
    [key: string]: string | boolean | string[] | null | undefined;
}

export default class DynamicTimetable extends Plugin {
    settings: DynamicTimetableSettings;
    view: TimetableView | null = null;
    targetFile: TFile | null = null;

    private static DEFAULT_SETTINGS: DynamicTimetableSettings = {
        filePath: null,
        showEstimate: false,
        taskEstimateDelimiter: ';',
        startTimeDelimiter: '@',
        headerNames: ['tasks', 'estimate', 'end'],
    };

    async onload() {
        console.log("DynamicTimetable: onload");

        this.settings = { ...DynamicTimetable.DEFAULT_SETTINGS, ...await this.loadData() };
        this.addSettingTab(new DynamicTimetableSettingTab(this.app, this));

        this.addToggleTimetableCommand();
        this.registerModifyEvent();
    }

    private addToggleTimetableCommand(): void {
        this.addCommand({
            id: "toggle-timetable",
            name: "Show/Hide Timetable",
            callback: () => {
                const leaves = this.app.workspace.getLeavesOfType("Timetable");
                if (leaves.length == 0) {
                    this.openTimetable();
                } else {
                    this.closeTimetable();
                }
            }
        });
    }

    private registerModifyEvent(): void {
        this.registerEvent(this.app.vault.on("modify", async (file) => {
            if (file === this.targetFile && this.view) {
                await this.view.update();
            }
        }));
    }

    async openTimetable() {
        this.checkTargetFile();
        const leaf = this.app.workspace.getRightLeaf(false);
        leaf.setViewState({ type: "Timetable" });
        this.app.workspace.revealLeaf(leaf);
        this.view = new TimetableView(leaf, this);
        this.registerView("Timetable", () => this.view!);
    }

    closeTimetable() {
        this.app.workspace.detachLeavesOfType("Timetable");
    }

    checkTargetFile() {
        this.targetFile = this.settings.filePath
            ? this.app.vault.getAbstractFileByPath(this.settings.filePath) as TFile
            : this.app.workspace.getActiveFile() as TFile | null;

        if (!this.targetFile) {
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
        const { headerNames, showEstimate } = this.plugin.settings;
        const [taskHeaderName, estimateHeaderName, endHeaderName] = headerNames;

        const tableHeaderValues = [taskHeaderName];
        if (showEstimate) {
            tableHeaderValues.push(estimateHeaderName);
        }
        tableHeaderValues.push(endHeaderName);
        return this.createTableRow(tableHeaderValues, true);
    }

    private appendTableBodyRows(tableBody: HTMLTableSectionElement, tasks: Task[]): void {
        const { showEstimate } = this.plugin.settings;
        const MILLISECONDS_IN_MINUTE = 60000;

        let currentTime = new Date();
        let previousEndTime: Date | null = null;

        for (let task of tasks) {
            const { task: parsedTaskName, startTime, estimate } = task;
            const minutes = estimate ? parseInt(estimate) : null;
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
        return new Intl.DateTimeFormat(navigator.language, { hour: "numeric", minute: "numeric" }).format(date);
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
    constructor(private separator: string, private startTimeDelimiter: string) { }

    static fromSettings(settings: DynamicTimetableSettings): TaskParser {
        return new TaskParser(settings.taskEstimateDelimiter, settings.startTimeDelimiter);
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
        const estimateAndStartTimeRegex = new RegExp(`(\\${this.separator}\\s*\\d+\\s*|\\${this.startTimeDelimiter}\\s*(?:\\d{4}-\\d{2}-\\d{2}T)?\\d{1,2}:\\d{2})`, 'g');

        return taskName
            .replace(taskNameRegex, "")
            .trim()
            .replace(linkRegex, "$2")
            .replace(markdownLinkRegex, "$1")
            .replace(estimateAndStartTimeRegex, "")
            .trim();
    }

    public parseStartTime(task: string): Date | null {
        const timeRegex = new RegExp(`\\${this.startTimeDelimiter}\\s*(\\d{1,2}:\\d{2})`);
        const dateTimeRegex = new RegExp(`\\${this.startTimeDelimiter}\\s*(\\d{4}-\\d{2}-\\d{2}T\\d{1,2}:\\d{2})`);

        const timeMatch = task.match(timeRegex);
        const dateTimeMatch = task.match(dateTimeRegex);

        if (dateTimeMatch) {
            const parsedDateTime = new Date(dateTimeMatch[1]);
            if (!isNaN(parsedDateTime.getTime())) {
                return parsedDateTime;
            }
        } else if (timeMatch) {
            const currentTime = new Date();
            const [hours, minutes] = timeMatch[1].split(":").map(Number);
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
        this.createTaskEstimateDelimiterSetting();
        this.createStartTimeDelimiterSetting();
        this.plugin.settings.headerNames.forEach((headerName, index) => {
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
            .setDesc("Show/hide the estimate column")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showEstimate)
                    .onChange(async (value) => {
                        await this.updateSetting("showEstimate", value);
                    })
            );

        return showEstimateSetting;
    }

    private createTaskEstimateDelimiterSetting(): Setting {
        const taskEstimateDelimiterSetting = new Setting(this.containerEl)
            .setName("Task/Estimate Delimiter")
            .setDesc("Enter the delimiter to use between the task name and estimate")
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
            .setDesc("Enter the delimiter to use between the task name and start time")
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
            .setDesc(`Enter the name of header ${index + 1}`)
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
        this.plugin.view?.update();
    }
}
