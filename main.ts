import { Plugin, WorkspaceLeaf, ItemView, App, TFile, PluginSettingTab, Setting } from "obsidian";

export default class DynamicTimetable extends Plugin {
    settings: DynamicTimetableSettings;
    view: TimetableView | null = null;

    async onload() {
        console.log("DynamicTimetable: onload");

        await this.loadSettings();

        this.addCommand({
            id: "toggle-timetable",
            name: "Show/Hide Timetable",
            callback: this.toggleTimetable.bind(this)
        });

        this.addSettingTab(new DynamicTimetableSettingTab(this.app, this));
    }

    toggleTimetable() {
        const leaves = this.app.workspace.getLeavesOfType("Timetable");
        if (leaves.length > 0) {
            this.app.workspace.detachLeavesOfType("Timetable");
        } else {
            const leaf = this.app.workspace.getRightLeaf(false);
            leaf.setViewState({ type: "Timetable" });
            this.app.workspace.revealLeaf(leaf);
            if (!this.view) {
                this.view = new TimetableView(leaf, this);
                this.registerView("Timetable", () => this.view!);
                this.registerEvent(
                    this.app.vault.on("modify", (file) => {
                        if (file === this.app.workspace.getActiveFile() && this.view) {
                            this.view.update();
                        }
                    })
                );
            }
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, this.loadData() || {});
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
}

interface TimetableView extends ItemView {
    containerEl: HTMLDivElement;
    update(): Promise<void>;
}

class TimetableView extends ItemView {
    private readonly MILLISECONDS_IN_MINUTE = 60000;
    private readonly plugin: DynamicTimetable;

    constructor(leaf: WorkspaceLeaf, plugin: DynamicTimetable) {
        super(leaf);
        this.plugin = plugin;
        this.initializeView();
    }

    private initializeView(): void {
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
        const tasks = await this.getTasks();
        this.renderTable(tasks);
    }

    async getTasks(): Promise<string[]> {
        const content = await this.getContent();
        return this.parseTasksFromContent(content);
    }

    async getContent(): Promise<string> {
        const filePath = this.plugin.settings.filePath;
        let file: TFile;

        if (filePath) {
            file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
            if (!file) {
                throw new Error(`File not found: ${filePath}`);
            }
        } else {
            file = this.app.workspace.getActiveFile() as TFile;
            if (!file || !(file instanceof TFile)) {
                throw new Error("No active file or active file is not a Markdown file");
            }
        }
        return await this.app.vault.cachedRead(file);
    }

    parseTasksFromContent(content: string): string[] {
        const separator = this.plugin.settings.taskEstimateDelimiter;
        const tasks: string[] = [];

        for (const line of content.split("\n")) {
            const task = line.trim();
            if (task.startsWith("- [ ]")) {
                const [taskName, timeEstimate] = task.replace(/^\- \[\] /, '').split(separator);
                if (taskName) {
                    tasks.push(`${taskName.trim()}${separator}${timeEstimate ? timeEstimate.trim() : ''}`);
                }
            }
        }
        return tasks;
    }

    async renderTable(tasks: string[]): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        function createTable(): HTMLTableElement {
            return contentEl.createEl("table");
        }

        function createTableHeaderCell(text: string, row: HTMLTableRowElement): void {
            const cell = row.createEl("th");
            cell.textContent = text;
        }

        async function createTableCell(text: string, row: HTMLTableRowElement): Promise<void> {
            const cell = row.createEl("td");
            cell.textContent = text;
        }

        function createTableRow(): HTMLTableRowElement {
            return tableBody.createEl("tr");
        }

        function parseTaskName(taskName: string): string {
            return taskName.replace(/^-\s*\[\s*.\s*\]\s*/, "")
                .replace(/\[\[|\]\]/g, "")
                .trim();
        }

        function formatTime(date: Date): string {
            return new Intl.DateTimeFormat(navigator.language, { hour: "numeric", minute: "numeric" }).format(date);
        }

        const scheduleTable = createTable();
        const tableHead = scheduleTable.createEl("thead");
        const tableBody = scheduleTable.createEl("tbody");
        const tableHeaderRow = tableHead.createEl("tr");

        createTableHeaderCell(this.plugin.settings.headerNames[0], tableHeaderRow);
        if (this.plugin.settings.showEstimate) {
            createTableHeaderCell(this.plugin.settings.headerNames[1], tableHeaderRow);
        }
        createTableHeaderCell(this.plugin.settings.headerNames[2], tableHeaderRow);

        let currentTime = new Date();

        for (let task of tasks) {
            const taskEstimateDelimiter = this.plugin.settings.taskEstimateDelimiter;
            const [taskName, timeEstimate] = task.split(taskEstimateDelimiter);
            const parsedTaskName = parseTaskName(taskName);
            const minutes = parseInt(timeEstimate);
            const endTime = new Date(currentTime.getTime() + minutes * this.MILLISECONDS_IN_MINUTE);
            const endTimeStr = formatTime(endTime);

            const tableRow = createTableRow();
            await createTableCell(parsedTaskName, tableRow);
            if (this.plugin.settings.showEstimate) {
                await createTableCell(`${timeEstimate}m`, tableRow);
            }
            await createTableCell(endTimeStr, tableRow);

            tableBody.appendChild(tableRow);

            currentTime = endTime;
        }

        scheduleTable.appendChild(tableHead);
        scheduleTable.appendChild(tableBody);
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
const DEFAULT_SETTINGS: DynamicTimetableSettings = {
    filePath: null,
    showEstimate: false,
    taskEstimateDelimiter: ':',
    headerNames: ['tasks', 'estimate', 'end'],
};

class DynamicTimetableSettingTab extends PluginSettingTab {
    plugin: DynamicTimetable;

    constructor(app: App, plugin: DynamicTimetable) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        const handleTextInputChange = async (settingName: keyof DynamicTimetableSettings, newValue: string | null) => {
            this.plugin.settings[settingName] = newValue;
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.view?.update();
        }

        new Setting(containerEl)
            .setName("File Path")
            .setDesc("Enter the path to the Markdown file to get task list from. Leave blank to use active file.")
            .addText((text) => {
                const el = text
                    .setPlaceholder("/path/to/target/file.md")
                    .setValue(this.plugin.settings.filePath || "");
                el.inputEl.addEventListener("change", async (ev) => {
                    if (!(ev.target instanceof HTMLInputElement)) {
                        return;
                    }
                    const value = ev.target.value.trim() || null;
                    await handleTextInputChange("filePath", value);
                });
                return el;
            });

        new Setting(containerEl)
            .setName('Show Estimate Column')
            .setDesc('Show/hide the estimate column')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showEstimate)
                .onChange(async (value) => {
                    this.plugin.settings.showEstimate = value;
                    await this.plugin.saveSettings();
                    this.plugin.view?.update();
                }));

        new Setting(containerEl)
            .setName('Task/Estimate Delimiter')
            .setDesc('Enter the delimiter to use between the task name and estimate')
            .addText(text => text
                .setValue(this.plugin.settings.taskEstimateDelimiter)
                .onChange(async (value) => {
                    await handleTextInputChange("taskEstimateDelimiter", value);
                }));

        const headerNames = this.plugin.settings.headerNames;

        for (let i = 0; i < headerNames.length; i++) {
            new Setting(containerEl)
                .setName(`Header Name ${i + 1}`)
                .setDesc(`Enter the name of header ${i + 1}`)
                .addText(text => text
                    .setValue(headerNames[i])
                    .onChange(async (value) => {
                        headerNames[i] = value;
                        await this.plugin.saveSettings();
                        this.plugin.view?.update();
                    })
                );
        }
    }
}
