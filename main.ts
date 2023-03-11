import { Plugin, WorkspaceLeaf, ItemView } from "obsidian";

export default class TaskSchedulePlugin extends Plugin {
    scheduleView: ScheduleView | null = null;

    async onload() {
        console.log("TaskSchedulePlugin: onload");

        this.addCommand({
            id: "toggle-schedule",
            name: "Toggle Task Schedule",
            callback: async () => {
                const tasks = await getTasks(this.app);

                const leaves = this.app.workspace.getLeavesOfType("task-schedule");

                if (leaves.length > 0) {
                    this.app.workspace.detachLeavesOfType("task-schedule");
                } else {
                    const leaf = this.app.workspace.getRightLeaf(false);
                    await leaf.setViewState({ type: "task-schedule" });
                    this.app.workspace.revealLeaf(leaf);

                    if (!this.scheduleView) {
                        this.scheduleView = new ScheduleView(leaf, tasks);
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
        console.log("TaskSchedulePlugin: onunload");
    }
}

interface ScheduleView extends ItemView {
    containerEl: HTMLDivElement;
    update(): Promise<void>;
}

class ScheduleView extends ItemView {
    tasks: string[];

    constructor(leaf: WorkspaceLeaf, tasks: string[]) {
        super(leaf);
        this.tasks = tasks;
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
        const { contentEl } = this;
        contentEl.innerHTML = "";

        const tasks = await getTasks(this.app);

        let currentTime = new Date();
        let scheduleTable =
            "<table><tr><th>tasks</th><th>estimate</th><th>end</th></tr>";

        for (let task of tasks) {
            let [taskName, timeEstimate] = task.split(":");
            taskName = taskName
                .replace(/^-\s*\[\s*.\s*\]\s*/, "")
                .replace(/\[\[|\]\]/g, "")
                .trim();
            let minutes = parseInt(timeEstimate);
            let endTime = new Date(currentTime.getTime() + minutes * 60000);
            let endTimeStr =
                endTime.getHours().toString().padStart(2, "0") +
                ":" +
                endTime.getMinutes().toString().padStart(2, "0");
            scheduleTable += `<tr><td>${taskName}</td><td>${timeEstimate}m</td><td>${endTimeStr}</td></tr>`;
            currentTime = endTime;
        }

        scheduleTable += "</table>";
        const tableDiv = contentEl.createDiv();
        tableDiv.innerHTML = scheduleTable;
    }
}

async function getTasks(app: any): Promise<string[]> {
    const activeFile = app.workspace.getActiveFile();
    const content = await app.vault.read(activeFile);
    return content.split("\n").filter((line: string) => line.startsWith("- [ ]"));
}
