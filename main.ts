import { Plugin, WorkspaceLeaf, ItemView, Notice, App, TFile } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";

export default class DynamicTimetable extends Plugin {
    settings: DynamicTimetableSettings;

    scheduleView: TimetableView | null = null;

    async onload() {
        console.log("DynamicTimetable: onload");

        await this.loadSettings();

        this.addCommand({
            id: "toggle-timetable",
            name: "Show/Hide Timetable",
            callback: () => {
                const leaves = this.app.workspace.getLeavesOfType("task-schedule");

                if (leaves.length > 0) {
                    this.app.workspace.detachLeavesOfType("task-schedule");
                } else {
                    const leaf = this.app.workspace.getRightLeaf(false);
                    leaf.setViewState({ type: "task-schedule" });
                    this.app.workspace.revealLeaf(leaf);

                    if (!this.scheduleView) {
                        this.scheduleView = new TimetableView(leaf, this);
                        this.registerView("task-schedule", () => this.scheduleView!);
                        this.registerEvent(
                            this.app.vault.on("modify", (file) => {
                                if (
                                    file === this.app.workspace.getActiveFile() &&
                                    this.scheduleView
                                ) {
                                    this.scheduleView.update();
                                }
                            })
                        );
                    }
                }
            },
        });

        this.addSettingTab(new DynamicTimetableSettingTab(this.app, this));
    }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
        this.containerEl.addClass("task-schedule");
    }

    getViewType(): string {
        return "task-schedule";
    }

    getDisplayText(): string {
        return "Task Schedule";
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
        try {
            let content = "";
            const filePath = this.plugin.settings.filePath;

            if (filePath) {
                const targetFile = this.app.vault.getAbstractFileByPath(filePath);
                if (!targetFile) {
                    throw new Error(`File not found: ${filePath}`);
                }
                if (!(targetFile instanceof TFile)) {
                    throw new Error(`File is not a Markdown file: ${filePath}`);
                }
                content = await this.app.vault.cachedRead(targetFile);
            } else {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile) {
                    throw new Error("No active file");
                }
                if (!(activeFile instanceof TFile)) {
                    throw new Error("Active file is not a Markdown file");
                }
                content = await this.app.vault.cachedRead(activeFile);
            }

        const separator = this.plugin.settings.taskEstimateDelimiter;
        const tasks: string[] = [];
        content.split("\n").forEach((line: string) => {
            line = line.replace(/^\t+/, ""); // Replace tab characters at the beginning of the line with spaces
            const separatorCount = line.split(separator).length - 1;
            if (separatorCount === 1 && line.startsWith("- [ ]")) {
                tasks.push(line.trim());
            }
        });

            return tasks;
        } catch (error) {
            new Notice(error.message);
            return [];
        }
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
            return date.getHours().toString().padStart(2, "0") +
                ":" +
                date.getMinutes().toString().padStart(2, "0");
        }

        const scheduleTable = createTable();
        const tableHead = scheduleTable.createEl("thead");
        const tableBody = scheduleTable.createEl("tbody");
        const tableHeaderRow = tableHead.createEl("tr");

        createTableHeaderCell(this.plugin.settings.headerNames[0], tableHeaderRow); // task
        if (this.plugin.settings.showEstimate) {
            createTableHeaderCell(this.plugin.settings.headerNames[1], tableHeaderRow); // estimate
        }
        createTableHeaderCell(this.plugin.settings.headerNames[2], tableHeaderRow); // end

        let currentTime = new Date();

        for (let task of tasks) {
            const taskEstimateDelimiter = this.plugin.settings.taskEstimateDelimiter;
            const [taskName, timeEstimate] = task.split(taskEstimateDelimiter);
            const parsedTaskName = parseTaskName(taskName);
            const minutes = parseInt(timeEstimate);
            const endTime = new Date(currentTime.getTime() + minutes * this.MILLISECONDS_IN_MINUTE);
            const endTimeStr = formatTime(endTime);

            const tableRow = createTableRow();
            await createTableCell(parsedTaskName, tableRow); // estimate
            if (this.plugin.settings.showEstimate) {
                await createTableCell(`${timeEstimate}m`, tableRow);
            }
            await createTableCell(endTimeStr, tableRow); // end

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
                    this.plugin.settings.filePath = value;
                    await this.plugin.saveData(this.plugin.settings);
                    this.plugin.scheduleView?.update();
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
                    this.plugin.scheduleView?.update();
                }));

        new Setting(containerEl)
            .setName('Task/Estimate Delimiter')
            .setDesc('Enter the delimiter to use between the task name and estimate')
            .addText(text => text
                .setValue(this.plugin.settings.taskEstimateDelimiter)
                .onChange(async (value) => {
                    this.plugin.settings.taskEstimateDelimiter = value;
                    await this.plugin.saveSettings();
                    this.plugin.scheduleView?.update();
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
                        this.plugin.scheduleView?.update();
                    })
                );
        }
    }
}
