import { App, Modal, Plugin, TFile } from "obsidian";

class TaskScheduleModal extends Modal {
	tasks: string[];

	constructor(app: App, tasks: string[]) {
		super(app);
		this.tasks = tasks;
	}

	onOpen() {
		let { contentEl } = this;

		let currentTime = new Date();
		let scheduleTable = "<table><tr><th>tasks</th><th>estimate</th><th>end</th></tr>";

		for (let task of this.tasks) {
			let [taskName, timeEstimate] = task.split(":");
			taskName = taskName.replace(/^-\s\[.\]\s/, '').replace(/\[\[|\]\]/g, '').trim();
			let minutes = parseInt(timeEstimate);
			let endTime = new Date(currentTime.getTime() + minutes * 60000);
			let endTimeStr = endTime.getHours().toString().padStart(2, "0") + ":" + endTime.getMinutes().toString().padStart(2, "0");
			scheduleTable += `<tr><td>${taskName}</td><td>${timeEstimate}m</td><td>${endTimeStr}</td></tr>`;
			currentTime = endTime;
		}

		scheduleTable += "</table>";
		contentEl.innerHTML = scheduleTable;
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}

export default class TaskSchedulePlugin extends Plugin {
	async onload() {
		console.log("TaskSchedulePlugin: onload");

		this.addCommand({
			id: "show-schedule",
			name: "show-schedule",
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					const content = await this.app.vault.read(activeFile);
					const tasks = content.split("\n").filter((line) => line.startsWith("- [ ]"));
					new TaskScheduleModal(this.app, tasks).open();
				}
			},
		});
	}

	onunload() {
		console.log("TaskSchedulePlugin: onunload");
	}
}
