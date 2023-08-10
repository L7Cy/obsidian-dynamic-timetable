import { TaskParser, Task as ImportedTask } from './TaskParser';
import DynamicTimetable from './main';

export type Task = ImportedTask & {
  previousTaskEndTime?: Date | null;
};

type TaskUpdate = {
  task: Task;
  elapsedTime: number;
  remainingTime: number | undefined;
};

export const taskFunctions = (plugin: DynamicTimetable) => {
  const formatTime = (date: Date): string => {
    let hours = date.getHours();
    let minutes = date.getMinutes();
    if (minutes === 0) {
      return `${hours.toString().padStart(2, '0')}00`;
    }
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}`;
  };

  const updateStartTimeInYAML = (content: string, startTime: Date): string => {
    const formattedTime = `${startTime
      .getHours()
      .toString()
      .padStart(2, '0')}:${startTime
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${startTime.getSeconds().toString().padStart(2, '0')}`;

    const yamlStartTimeRegex = /(^startTime: \d{2}:\d{2}:\d{2})/m;
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
      return content.replace(/---\n([\s\S]*?)\n---/m, `---\n${yamlBlock}\n---`);
    } else {
      return `---\nstartTime: ${formattedTime}\n---\n` + content;
    }
  };

  const getElapsedTime = (content: string) => {
    const taskParser = TaskParser.fromSettings(plugin.settings);
    const startTime = taskParser.getYamlStartTime(content);
    if (!startTime) return 0;
    const elapsedTimeInMinutes = (Date.now() - startTime.getTime()) / 60000;
    return Math.max(0, Math.floor(elapsedTimeInMinutes));
  };

  const updateTaskInContent = (
    content: string,
    { elapsedTime, remainingTime }: TaskUpdate
  ): string => {
    const taskRegex = new RegExp(
      `^- \\[ \\] (.+?)(\\s*${plugin.settings.taskEstimateDelimiter.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      )}\\s*(\\d+\\.?\\d*)|\\s*@\\s*\\d{1,2}[:]?\\d{2})`,
      'm'
    );

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const taskMatch = lines[i].match(taskRegex);
      if (taskMatch) {
        const originalTaskName = taskMatch[1];
        const actualStartTime = new Date(Date.now() - elapsedTime * 60 * 1000);

        lines[i] = `- [x] ${originalTaskName} ${
          plugin.settings.taskEstimateDelimiter
        } ${elapsedTime.toFixed(0)} @ ${formatTime(actualStartTime)}`;

        if (remainingTime !== undefined) {
          const newTaskToAdd = `- [ ] ${originalTaskName} ${
            plugin.settings.taskEstimateDelimiter
          } ${remainingTime.toFixed(0)}`;
          lines.splice(i + 1, 0, newTaskToAdd);
        }
        break;
      }
    }
    return lines.join('\n');
  };

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

  const updateTask = async (task: Task, remainingTime?: number) => {
    if (!plugin.targetFile || !task.estimate) {
      return;
    }

    let content = await plugin.app.vault.cachedRead(plugin.targetFile);
    const elapsedTime = getElapsedTime(content);
    const taskUpdate: TaskUpdate = { task, elapsedTime, remainingTime };

    content = updateTaskInContent(content, taskUpdate);
    // This prevents the toggled contents in the markdown from being unintentionally expanded.
    await plugin.app.vault.modify(plugin.targetFile, content);

    const now = new Date();
    // Re-read the file and update the start time.
    content = await plugin.app.vault.cachedRead(plugin.targetFile);
    content = updateStartTimeInYAML(content, now);
    await plugin.app.vault.modify(plugin.targetFile, content);
  };

  const completeTask = async (task: Task) => {
    await updateTask(task, undefined);
  };

  const interruptTask = async () => {
    if (!plugin.targetFile) {
      return;
    }
    const content = await plugin.app.vault.cachedRead(plugin.targetFile);
    const taskParser = TaskParser.fromSettings(plugin.settings);
    let tasks: Task[] = taskParser.filterAndParseTasks(content);
    let elapsedTime = getElapsedTime(content);
    let remainingTime = 0;
    const firstUncompletedTask = tasks.find((task) => !task.isCompleted);
    if (!firstUncompletedTask) return;
    if (firstUncompletedTask?.estimate) {
      remainingTime = Math.max(
        0,
        Math.ceil(parseFloat(firstUncompletedTask.estimate) - elapsedTime)
      );
    }

    await updateTask(firstUncompletedTask, remainingTime);
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
