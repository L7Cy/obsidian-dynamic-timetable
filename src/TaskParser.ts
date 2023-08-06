import { DynamicTimetableSettings } from "./main";

export interface Task {
	task: string;
	startTime: Date | null;
	estimate: string | null;
	endTime: Date | null;
	isCompleted: boolean;
}

export class TaskParser {
	private dateDelimiter: RegExp;

	constructor(
		private separator: string,
		private startTimeDelimiter: string,
		dateDelimiter: string,
		private showStartTimeInTaskName: boolean,
		private showEstimateInTaskName: boolean
	) {
		this.dateDelimiter = new RegExp(dateDelimiter);
	}

	static fromSettings(settings: DynamicTimetableSettings): TaskParser {
		return new TaskParser(
			settings.taskEstimateDelimiter,
			settings.startTimeDelimiter,
			settings.dateDelimiter,
			settings.showStartTimeInTaskName,
			settings.showEstimateInTaskName
		);
	}

	public filterAndParseTasks(
		content: string,
		yamlStartTime: Date | null
	): Task[] {
		let previousEndTime: Date | null = null;
		let firstUncompletedTaskFound = false;
		let nextDay = 0;
		let dateDelimiterFound = false;

		const tasks = content
			.split("\n")
			.map((line) => line.trim())
			.reduce((acc: Task[], task) => {
				if (this.isDateDelimiterLine(task)) {
					dateDelimiterFound = true;
					return acc;
				}

				if (!task.startsWith("- [ ]") && !task.startsWith("- [x]")) {
					return acc;
				}

				const isCompleted = task.startsWith("- [x]");
				const taskName = this.parseTaskName(task);

				if (dateDelimiterFound) {
					nextDay++;
					dateDelimiterFound = false;
				}

				let startTime = this.parseStartTime(task, nextDay);
				const estimate = this.parseEstimate(task);

				if (
					!isCompleted &&
					!firstUncompletedTaskFound &&
					yamlStartTime
				) {
					startTime = yamlStartTime;
					firstUncompletedTaskFound = true;
				} else if (!startTime && previousEndTime) {
					startTime = previousEndTime;
				}

				let endTime: Date | null = null;
				if (startTime && estimate) {
					endTime = new Date(startTime);
					endTime.setMinutes(endTime.getMinutes() + Number(estimate));
					previousEndTime = endTime;
				}

				acc.push({
					task: taskName,
					startTime: startTime,
					estimate: estimate,
					endTime: endTime,
					isCompleted: isCompleted,
				});

				return acc;
			}, []);

		return tasks;
	}

	private isDateDelimiterLine(line: string): boolean {
		return this.dateDelimiter.test(line);
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
			`\\${this.startTimeDelimiter}\\s*(?:\\d{4}-\\d{2}-\\d{2}T)?(\\d{1,2}:\\d{2})`
		);

		if (this.showStartTimeInTaskName) {
			taskName = taskName.replace(
				startTimeRegex,
				(match, p1) => `${this.startTimeDelimiter}${p1}`
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

	public parseStartTime(task: string, nextDay: number): Date | null {
		const timeRegex = new RegExp(
			`\\${this.startTimeDelimiter}\\s*(\\d{1,2}:\\d{2})`
		);
		const dateTimeRegex = new RegExp(
			`\\${this.startTimeDelimiter}\\s*(\\d{4}-\\d{2}-\\d{2}T\\d{1,2}:\\d{2})`
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
			const startDate = new Date(
				currentTime.setDate(currentTime.getDate() + nextDay)
			);
			startDate.setHours(hours, minutes);
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
