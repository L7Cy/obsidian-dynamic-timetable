import DynamicTimetable from "./main";
import { taskFunctions } from "./TaskManager";

export class CommandsManager {
	private plugin: DynamicTimetable;

	constructor(plugin: DynamicTimetable) {
		this.plugin = plugin;
	}

	toggleTimetable(): void {
		const leaves = this.plugin.app.workspace.getLeavesOfType("Timetable");
		if (leaves.length == 0) {
			this.plugin.openTimetable();
		} else {
			this.plugin.closeTimetable();
		}
	}

	initializeTimetableView(): void {
		this.plugin.initTimetableView();
	}

	completeTask(): void {
		const taskManager = taskFunctions(this.plugin);
		const firstUncompletedTask = this.plugin.tasks.find(
			(task) => !task.isCompleted
		);
		if (firstUncompletedTask) {
			taskManager.completeTask(firstUncompletedTask);
		}
	}

	interruptTask(): void {
		const taskManager = taskFunctions(this.plugin);
		const firstUncompletedTask = this.plugin.tasks.find(
			(task) => !task.isCompleted
		);
		if (firstUncompletedTask) {
			taskManager.interruptTask(firstUncompletedTask);
		}
	}
}
