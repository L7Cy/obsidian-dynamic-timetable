import { Plugin, WorkspaceLeaf, ItemView, App, TFile, PluginSettingTab, Setting, Notice } from "obsidian";

interface DynamicTimetableSettings {
    filePath: string | null;
    showEstimate: boolean;
    taskEstimateDelimiter: string;
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
        this.taskParser = TaskParser.fromSettings(plugin.settings);
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
        this.renderTable(tasks);
    }

    parseTasksFromContent(content: string): string[] {
        const tasks = this.taskParser.filterAndParseTasks(content);
        return tasks;
    }

    async renderTable(tasks: string[]): Promise<void> {
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

    private appendTableBodyRows(tableBody: HTMLTableSectionElement, tasks: string[]): void {
        const { showEstimate, taskEstimateDelimiter } = this.plugin.settings;
        const MILLISECONDS_IN_MINUTE = 60000;

        let currentTime = new Date();
        for (let task of tasks) {
            const [taskName, timeEstimate] = task.split(taskEstimateDelimiter);
            const parsedTaskName = this.taskParser.parseTaskName(taskName);
            const minutes = parseInt(timeEstimate);
            const endTime = new Date(currentTime.getTime() + minutes * MILLISECONDS_IN_MINUTE);
            const endTimeStr = this.formatTime(endTime);

            const tableRowValues = [parsedTaskName];
            if (showEstimate) {
                tableRowValues.push(`${timeEstimate}m`);
            }
            tableRowValues.push(endTimeStr);
            tableBody.appendChild(this.createTableRow(tableRowValues));

            currentTime = endTime;
        }
    }

    private createTableRow(rowValues: string[], isHeader = false): HTMLTableRowElement {
        const row = document.createElement("tr");
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
    constructor(private separator: string) { }

    static fromSettings(settings: DynamicTimetableSettings): TaskParser {
        return new TaskParser(settings.taskEstimateDelimiter);
    }

    public filterAndParseTasks(content: string): string[] {
        return content.split("\n")
            .map(line => line.trim())
            .filter(line => line.startsWith("- [ ]"))
            .filter(task => task.includes(this.separator))
            .map(task => {
                const [taskName, timeEstimate] = task.replace(/^\- \[\] /, '').split(this.separator);
                const parsedTaskName = this.parseTaskName(taskName);
                const parsedTimeEstimate = timeEstimate ? timeEstimate.trim() : '';
                return `${parsedTaskName}${this.separator}${parsedTimeEstimate}`;
            });
    }

    public parseTaskName(taskName: string): string {
        const taskNameRegex = /^-\s*\[\s*.\s*\]\s*/;
        const linkRegex = /\[\[([^\[\]]*\|)?([^\[\]]+)\]\]/g;
        const markdownLinkRegex = /\[([^\[\]]+)\]\(.+?\)/g;

        return taskName
            .replace(taskNameRegex, "")
            .trim()
            .replace(linkRegex, "$2")
            .replace(markdownLinkRegex, "$1")
            .trim();
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
