import { Plugin, WorkspaceLeaf, ItemView, App, TFile, PluginSettingTab, Setting, Notice } from "obsidian";

export default class DynamicTimetable extends Plugin {
    settings: DynamicTimetableSettings;
    view: TimetableView | null = null;

    private static DEFAULT_SETTINGS: DynamicTimetableSettings = {
        filePath: null,
        showEstimate: false,
        taskEstimateDelimiter: ':',
        headerNames: ['tasks', 'estimate', 'end'],
    };

    async onload() {
        console.log("DynamicTimetable: onload");

        await this.loadDataFromSettings();

        this.addCommand({
            id: "toggle-timetable",
            name: "Show/Hide Timetable",
            callback: this.toggleTimetable.bind(this)
        });

        this.addSettingTab(new DynamicTimetableSettingTab(this.app, this));
    }

    toggleTimetable() {
        const leaves = this.app.workspace.getLeavesOfType("Timetable");
        leaves.length > 0 ? this.hideTimetable() : this.showTimetable();
    }

    showTimetable() {
        const leaf = this.app.workspace.getRightLeaf(false);
        leaf.setViewState({ type: "Timetable" });
        this.app.workspace.revealLeaf(leaf);
        if (!this.view) {
            this.view = new TimetableView(leaf, this);
            this.registerView("Timetable", () => this.view!);
            this.registerModifyEventHandler();
        }
    }

    hideTimetable() {
        this.app.workspace.detachLeavesOfType("Timetable");
    }

    private registerModifyEventHandler() {
        this.registerEvent(
            this.app.vault.on("modify", (file) => {
                if (file === this.app.workspace.getActiveFile() && this.view) {
                    this.view.update();
                }
            })
        );
    }

    private async loadDataFromSettings() {
        this.settings = Object.assign({}, DynamicTimetable.DEFAULT_SETTINGS, this.loadData());
    }
    async saveDataToSettings() {
        await this.saveData(this.settings);
    }
}

interface TimetableView extends ItemView {
    containerEl: HTMLDivElement;
    update(): Promise<void>;
}

class TimetableView extends ItemView {
    constructor(leaf: WorkspaceLeaf, private readonly plugin: DynamicTimetable) {
        super(leaf);
        this.containerEl.addClass("Timetable");
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

    async update(): Promise<void> {
        const content = await this.getContent();
        const tasks = this.parseTasksFromContent(content);
        this.renderTable(tasks);
    }

    async getContent(): Promise<string> {
        let file: TFile;

        if (this.plugin.settings.filePath) {
            file = this.app.vault.getAbstractFileByPath(this.plugin.settings.filePath) as TFile;
        } else {
            file = this.app.workspace.getActiveFile() as TFile;
        }

        if (!file || !(file instanceof TFile)) {
            this.plugin.hideTimetable();
            new Notice("No active file or active file is not a Markdown file");
        }
        return await this.app.vault.cachedRead(file);
    }

    parseTasksFromContent(content: string): string[] {
        const separator = this.plugin.settings.taskEstimateDelimiter;

        const tasks = content.split("\n")
            .map(line => line.trim())
            .filter(line => line.startsWith("- [ ]"))
            .filter(task => task.includes(separator))
            .map(task => {
                const [taskName, timeEstimate] = task.replace(/^\- \[\] /, '').split(separator);
                const parsedTaskName = taskName.replace(/^-\s*\[\s*.\s*\]\s*/, "").replace(/\[\[|\]\]/g, "").trim();
                const parsedTimeEstimate = timeEstimate ? timeEstimate.trim() : '';
                return `${parsedTaskName}${separator}${parsedTimeEstimate}`;
            });

        return tasks;
    }

    async renderTable(tasks: string[]): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        function createTable(): HTMLTableElement {
            return contentEl.createEl("table");
        }

        function createTableCell(text: string, isHeader = false) {
            const cell = isHeader ? document.createElement("th") : document.createElement("td");
            cell.textContent = text;
            return cell;
        }

        function createTableRow(rowValues: string[], isHeader = false): HTMLTableRowElement {
            const row = document.createElement("tr");
            rowValues.forEach((value) => {
                row.appendChild(createTableCell(value, isHeader));
            });
            return row;
        }

        function parseTaskName(taskName: string): string {
            const taskNameRegex = /^-\s*\[\s*.\s*\]\s*/;
            const linkRegex = /\[\[|\]\]/g;
            return taskName.replace(taskNameRegex, "").replace(linkRegex, "").trim();
        }

        function formatTime(date: Date): string {
            return new Intl.DateTimeFormat(navigator.language, { hour: "numeric", minute: "numeric" }).format(date);
        }

        const scheduleTable = createTable();
        const tableHead = scheduleTable.createTHead();
        const tableBody = scheduleTable.createTBody();

        const { headerNames, showEstimate, taskEstimateDelimiter } = this.plugin.settings;
        const [taskHeaderName, estimateHeaderName, endHeaderName] = headerNames;

        const tableHeaderValues = [taskHeaderName];
        if (showEstimate) {
            tableHeaderValues.push(estimateHeaderName);
        }
        tableHeaderValues.push(endHeaderName);
        tableHead.appendChild(createTableRow(tableHeaderValues, true));

        let currentTime = new Date();
        const MILLISECONDS_IN_MINUTE = 60000;

        for (let task of tasks) {
            const [taskName, timeEstimate] = task.split(taskEstimateDelimiter);
            const parsedTaskName = parseTaskName(taskName);
            const minutes = parseInt(timeEstimate);
            const endTime = new Date(currentTime.getTime() + minutes * MILLISECONDS_IN_MINUTE);
            const endTimeStr = formatTime(endTime);

            const tableRowValues = [parsedTaskName];
            if (showEstimate) {
                tableRowValues.push(`${timeEstimate}m`);
            }
            tableRowValues.push(endTimeStr);
            tableBody.appendChild(createTableRow(tableRowValues));

            currentTime = endTime;
        }

        contentEl.appendChild(scheduleTable);
    }
}

interface DynamicTimetableSettings {
    filePath: string | null;
    showEstimate: boolean;
    taskEstimateDelimiter: string;
    headerNames: string[];
    [key: string]: string | boolean | string[] | null | undefined;
}

class DynamicTimetableSettingTab extends PluginSettingTab {
    plugin: DynamicTimetable;

    constructor(app: App, plugin: DynamicTimetable) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private async updateSetting<T extends keyof DynamicTimetableSettings>(
        settingName: T,
        newValue: DynamicTimetableSettings[T]
    ): Promise<void> {
        this.plugin.settings[settingName] = newValue;
        await this.plugin.saveDataToSettings();
        this.plugin.view?.update();
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
                el.inputEl.addEventListener("change", async (ev) => {
                    if (!(ev.target instanceof HTMLInputElement)) {
                        return;
                    }
                    const value = ev.target.value.trim();
                    await this.updateSetting("filePath", value);
                });
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
                    .setPlaceholder(":")
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

    display(): void {
        this.containerEl.empty();

        this.createFilePathSetting();
        this.createShowEstimateSetting();
        this.createTaskEstimateDelimiterSetting();
        this.plugin.settings.headerNames.forEach((headerName, index) => {
            this.createHeaderNameSetting(headerName, index);
        });
    }
}
