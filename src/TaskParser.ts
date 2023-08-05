import { DynamicTimetableSettings, Task } from "./main";

export class TaskParser {
	constructor(
		private separator: string,
		private startTimeDelimiter: string,
		private showStartTimeInTaskName: boolean,
		private showEstimateInTaskName: boolean,
	) {}

	static fromSettings(settings: DynamicTimetableSettings): TaskParser {
		return new TaskParser(
			settings.taskEstimateDelimiter,
			settings.startTimeDelimiter,
			settings.showStartTimeInTaskName,
			settings.showEstimateInTaskName,
		);
	}

	public filterAndParseTasks(content: string): Task[] {
		const tasks = content
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.startsWith("- [ ]"))
			.filter(
				(task) =>
					task.includes(this.separator) ||
					task.includes(this.startTimeDelimiter),
			)
			.map((task) => {
				const taskName = this.parseTaskName(task);
				const startTime = this.parseStartTime(task);
				const estimate = this.parseEstimate(task);
				return {
					task: taskName,
					startTime: startTime,
					estimate: estimate,
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

		const startTimeRegex = new RegExp(
			`\\${this.startTimeDelimiter}\\s*(?:\\d{4}-\\d{2}-\\d{2}T)?(\\d{1,2}:\\d{2})`,
		);

		if (this.showStartTimeInTaskName) {
			taskName = taskName.replace(
				startTimeRegex,
				(match, p1) => `${this.startTimeDelimiter}${p1}`,
			);
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
		const timeRegex = new RegExp(
			`\\${this.startTimeDelimiter}\\s*(\\d{1,2}:\\d{2})`,
		);
		const dateTimeRegex = new RegExp(
			`\\${this.startTimeDelimiter}\\s*(\\d{4}-\\d{2}-\\d{2}T\\d{1,2}:\\d{2})`,
		);

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
