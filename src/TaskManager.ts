import { TaskParser, Task as ImportedTask } from "./TaskParser";
import DynamicTimetable from "./main";

export type Task = ImportedTask & {
	previousTaskEndTime?: Date | null;
};

type TaskUpdate = {
	task: Task;
	elapsedTime: number;
	remainingTime: number | undefined;
};

export const taskFunctions = (plugin: DynamicTimetable) => {
	const getYamlStartTime = (content: string): Date | null => {
		const match = content.match(
			/^startTime: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/m
		);
		if (match) {
			return new Date(match[1]);
		}
		return null;
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

	const updateStartTimeInYAML = (
		content: string,
		startTime: Date
	): string => {
		const formattedTime = `${startTime.getFullYear()}-${(
			startTime.getMonth() + 1
		)
			.toString()
			.padStart(2, "0")}-${startTime
			.getDate()
			.toString()
			.padStart(2, "0")} ${startTime
			.getHours()
			.toString()
			.padStart(2, "0")}:${startTime
			.getMinutes()
			.toString()
			.padStart(2, "0")}:${startTime
			.getSeconds()
			.toString()
			.padStart(2, "0")}`;

		const yamlStartTimeRegex =
			/(^startTime: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/m;
		const yamlBlockMatch = content.match(/---\n([\s\S]*?)\n---/m);

		if (yamlBlockMatch && yamlBlockMatch.length > 1) {
			let yamlBlock = yamlBlockMatch[1];
			if (yamlStartTimeRegex.test(yamlBlock)) {
				yamlBlock = yamlBlock.replace(
					yamlStartTimeRegex,
					`startTime: ${formattedTime}`
				);
			} else {
				yamlBlock = yamlBlock + `\nstartTime: ${formattedTime}`;
			}
			return content.replace(
				/---\n([\s\S]*?)\n---/m,
				`---\n${yamlBlock}\n---`
			);
		} else {
			return `---\nstartTime: ${formattedTime}\n---\n` + content;
		}
	};

	const getElapsedTime = (task: Task) => {
		const previousTaskEndTime = task.previousTaskEndTime || null;
		if (!previousTaskEndTime) return 0;
		const elapsedTimeInMinutes =
			(Date.now() - previousTaskEndTime.getTime()) / 60000;
		return Math.max(0, Math.floor(elapsedTimeInMinutes));
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

	const setCurrentTaskStartTimeInYAML = async () => {
		if (!plugin.targetFile) {
			return;
		}
		let content = await plugin.app.vault.cachedRead(plugin.targetFile);
		const taskParser = TaskParser.fromSettings(plugin.settings);
		const yamlStartTime = getYamlStartTime(content);
		let tasks: Task[] = taskParser.filterAndParseTasks(
			content,
			yamlStartTime
		);

		if (tasks.length > 0) {
			const currentTaskStartTime = tasks[0].startTime;
			if (currentTaskStartTime) {
				content = updateStartTimeInYAML(content, currentTaskStartTime);
				await plugin.app.vault.modify(plugin.targetFile, content);
			}
		}
	};

	const initializeTasks = async () => {
		if (!plugin.targetFile) {
			return [];
		}
		const content = await plugin.app.vault.cachedRead(plugin.targetFile);
		const taskParser = TaskParser.fromSettings(plugin.settings);
		const yamlStartTime = getYamlStartTime(content);
		let tasks: Task[] = taskParser.filterAndParseTasks(
			content,
			yamlStartTime
		);

		let previousTaskEndTime = null;
		for (let task of tasks) {
			task.previousTaskEndTime = previousTaskEndTime;
			previousTaskEndTime = task.endTime;
		}

		if (tasks.length > 0) {
			tasks[0].startTime =
				yamlStartTime || new Date(plugin.targetFile.stat.mtime);
		}
		return tasks;
	};

	const updateTask = async (task: Task, remainingTime?: number) => {
		if (!plugin.targetFile || !task.estimate) {
			return;
		}

		let content = await plugin.app.vault.cachedRead(plugin.targetFile);
		let elapsedTime = getElapsedTime(task);
		const taskUpdate: TaskUpdate = { task, elapsedTime, remainingTime };

		content = updateTaskInContent(content, taskUpdate);

		const tasks: Task[] = await initializeTasks();
		const currentTask = tasks[0];

		if (currentTask && currentTask.startTime) {
			content = updateStartTimeInYAML(content, currentTask.startTime);
		}

		const now = new Date();
		content = updateStartTimeInYAML(content, now);

		await plugin.app.vault.modify(plugin.targetFile, content);
	};

	const completeTask = (task: Task) => {
		updateTask(task, undefined);
		setCurrentTaskStartTimeInYAML();
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
		setCurrentTaskStartTimeInYAML();
	};

	return {
		initializeTasks,
		completeTask,
		interruptTask,
		getElapsedTime,
		updateTask,
		updateTaskInContent,
		formatTime,
		getYamlStartTime,
	};
};
