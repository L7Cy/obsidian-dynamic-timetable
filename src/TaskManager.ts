import { TaskParser, Task as ImportedTask } from "./TaskParser";
import DynamicTimetable from "./main";

type Task = ImportedTask & {
	previousTaskEndTime?: Date | null;
};

type TaskUpdate = {
	task: Task;
	elapsedTime: number;
	remainingTime: number | undefined;
};

export const taskFunctions = (plugin: DynamicTimetable) => {
	const initializeTasks = async () => {
		if (!plugin.targetFile) {
			return [];
		}
		const content = await plugin.app.vault.cachedRead(plugin.targetFile);
		const taskParser = TaskParser.fromSettings(plugin.settings);
		let tasks: Task[] = taskParser.filterAndParseTasks(content);

		let previousTaskEndTime = null;
		for (let task of tasks) {
			task.previousTaskEndTime = previousTaskEndTime;
			previousTaskEndTime = task.endTime;
		}

		if (tasks.length > 0 && tasks[0].startTime === null) {
			tasks[0].startTime = new Date(plugin.targetFile.stat.mtime);
		}
		return tasks;
	};

	const completeTask = (task: Task) => {
		updateTask(task, undefined);
	};

	const interruptTask = (task: Task) => {
		let elapsedTime = getElapsedTime(task);
		let remainingTime = 0;
		if (task.estimate !== null) {
			remainingTime = Math.max(
				0,
				Math.floor(parseFloat(task.estimate) - elapsedTime)
			);
		}

		if (remainingTime <= 0) {
			remainingTime = 0;
		}

		updateTask(task, remainingTime);
	};

	const getElapsedTime = (task: Task) => {
		const previousTaskEndTime = task.previousTaskEndTime || null;

		if (!previousTaskEndTime) {
			return 0;
		}

		let elapsedTimeInMinutes =
			(Date.now() - previousTaskEndTime.getTime()) / 60000;

		if (elapsedTimeInMinutes < 0) {
			elapsedTimeInMinutes += 24 * 60;
		}

		return Math.max(0, Math.floor(elapsedTimeInMinutes));
	};

	const updateTask = async (task: Task, remainingTime?: number) => {
		if (!plugin.targetFile || !task.estimate) {
			return;
		}

		let content = await plugin.app.vault.cachedRead(plugin.targetFile);
		let elapsedTime = getElapsedTime(task);
		const taskUpdate: TaskUpdate = { task, elapsedTime, remainingTime };
		content = updateTaskInContent(content, taskUpdate);

		await plugin.app.vault.modify(plugin.targetFile, content);
	};

	const updateTaskInContent = (
		content: string,
		{ task, elapsedTime, remainingTime }: TaskUpdate
	): string => {
		let startTime = task.task.match(
			new RegExp(`\\s*@\\s*(\\d{1,2}[:]?\\d{2})\\s*$`)
		);

		if (startTime && startTime[1].length === 4) {
			startTime[1] =
				startTime[1].slice(0, 2) + ":" + startTime[1].slice(2);
		}

		const actualStartTime = new Date(Date.now() - elapsedTime * 60 * 1000);

		const taskRegex = new RegExp(
			`^- \\[ \\] (.+?)(\\s*${plugin.settings.taskEstimateDelimiter.replace(
				/[.*+?^${}()|[\]\\]/g,
				"\\$&"
			)}\\s*${task.estimate}|\\s*@\\s*\\d{1,2}[:]?\\d{2})`,
			"m"
		);

		const lines = content.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const taskMatch = lines[i].match(taskRegex);
			if (taskMatch) {
				const originalTaskName = taskMatch[1];
				let newTaskLine = `- [x] ${originalTaskName} ${
					plugin.settings.taskEstimateDelimiter
				} ${elapsedTime.toFixed(0)}`;

				newTaskLine += ` @ ${formatTime(actualStartTime)}`;

				if (remainingTime !== undefined) {
					newTaskLine += `\n- [ ] ${originalTaskName} ${
						plugin.settings.taskEstimateDelimiter
					} ${remainingTime.toFixed(0)}`;
				}
				lines[i] = newTaskLine;
				break;
			}
		}
		return lines.join("\n");
	};

	const formatTime = (date: Date): string => {
		let hours = date.getHours();
		let minutes = date.getMinutes();

		if (minutes === 0) {
			return `${hours.toString().padStart(2, "0")}00`;
		}

		return `${hours.toString().padStart(2, "0")}:${minutes
			.toString()
			.padStart(2, "0")}`;
	};

	return {
		initializeTasks,
		completeTask,
		interruptTask,
		getElapsedTime,
		updateTask,
		updateTaskInContent,
		formatTime,
	};
};
