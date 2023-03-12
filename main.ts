import { Plugin, WorkspaceLeaf, ItemView, Notice } from "obsidian";

export default class DynamicTimetable extends Plugin {
    scheduleView: TimetableView | null = null;

    async onload() {
        console.log("DynamicTimetable: onload");

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
                        this.scheduleView = new TimetableView(leaf);
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
    }

    onunload() {
        console.log("Dynamic Timetable: onunload");
    }
}

interface TimetableView extends ItemView {
    containerEl: HTMLDivElement;
    update(): Promise<void>;
}

class TimetableView extends ItemView {
    private readonly MILLISECONDS_IN_MINUTE = 60000;
    private readonly HEADER_NAMES: string[] = ['tasks', 'estimate', 'end'];

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
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
            const activeFile = this.app.workspace.getActiveFile();

            if (!activeFile) {
                throw new Error("No active file");
            }

            if (!activeFile.path.endsWith(".md")) {
                throw new Error("Active file is not a Markdown file");
            }

            const content = await this.app.vault.cachedRead(activeFile);
            return content.split("\n").filter((line: string) => line.startsWith("- [ ]"));
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

        for (let i = 0; i < this.HEADER_NAMES.length; i++) {
            createTableHeaderCell(this.HEADER_NAMES[i], tableHeaderRow);
        }

        let currentTime = new Date();

        for (let task of tasks) {
            const [taskName, timeEstimate] = task.split(":");
            const parsedTaskName = parseTaskName(taskName);
            const minutes = parseInt(timeEstimate);
            const endTime = new Date(currentTime.getTime() + minutes * this.MILLISECONDS_IN_MINUTE);
            const endTimeStr = formatTime(endTime);

            const tableRow = createTableRow();
            await createTableCell(parsedTaskName, tableRow);
            await createTableCell(`${timeEstimate}m`, tableRow);
            await createTableCell(endTimeStr, tableRow);

            tableBody.appendChild(tableRow);

            currentTime = endTime;
        }

        scheduleTable.appendChild(tableHead);
        scheduleTable.appendChild(tableBody);
        contentEl.appendChild(scheduleTable);
    }
}
