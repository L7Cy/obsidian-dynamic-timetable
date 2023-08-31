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
      return `${hours.toString().padStart(2, '0')}:00`;
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
    let elapsedTimeInMinutes = (Date.now() - startTime.getTime()) / 60000;
    if (elapsedTimeInMinutes < 0) {
      elapsedTimeInMinutes += 24 * 60;
    }
    return Math.max(0, Math.floor(elapsedTimeInMinutes));
  };

  const updateTaskInContent = (
    content: string,
    { elapsedTime, remainingTime }: TaskUpdate
  ): string => {
    const taskRegex = new RegExp(
      `^- \\[ \\] (.+?)\\s*${plugin.settings.taskEstimateDelimiter.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      )}\\s*(\\d+\\.?\\d*)?(\\s*@\\s*\\d{1,2}[:]?\\d{2})?(\\s*#.*)?\\s*$`,
      'm'
    );

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const taskMatch = line.match(taskRegex);
      if (taskMatch) {
        const originalTaskName = taskMatch[1];
        const tags =
          line
            .match(/#([^\s!#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]+)/gu)
            ?.join(' ') || '';
        const actualStartTime = new Date(Date.now() - elapsedTime * 60 * 1000);

        lines[i] = `- [x] ${originalTaskName.replace(tags, '').trim()} ${
          plugin.settings.taskEstimateDelimiter
        } ${elapsedTime.toFixed(0)} @ ${formatTime(actualStartTime)} ${tags}`;

        if (remainingTime !== undefined) {
          const newTaskToAdd = `- [ ] ${originalTaskName
            .replace(tags, '')
            .trim()} ${
            plugin.settings.taskEstimateDelimiter
          } ${remainingTime.toFixed(0)} ${tags}`;
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
      tasks[0].endTime = new Date(tasks[0].startTime);
      tasks[0].endTime.setMinutes(
        tasks[0].endTime.getMinutes() + Number(tasks[0].estimate)
      );
    }
    return tasks;
  };

  const updateTask = async (task: Task, remainingTime?: number) => {
    if (!plugin.targetFile || !task.estimate) {
      return;
    }

    let content = await plugin.app.vault.cachedRead(plugin.targetFile);
    const elapsedTime = getElapsedTime(content);
    await updateDictionaryFile(task, elapsedTime);
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

  const updateDictionaryFile = async (task: Task, elapsedTime: number) => {
    if (!plugin.targetFile) {
      return;
    }
    const targetFileContent = await plugin.app.vault.cachedRead(
      plugin.targetFile
    );
    const taskParser = TaskParser.fromSettings(plugin.settings);
    let tasks: Task[] = taskParser.filterAndParseTasks(targetFileContent);
    const firstUncompletedTask = tasks.find((task) => !task.isCompleted);
    if (!firstUncompletedTask) return;

    const dictionaryPath = plugin.settings.pathToDictionary;
    const dictionaryFile = plugin.app.metadataCache.getFirstLinkpathDest(
      dictionaryPath,
      '/'
    );

    if (!dictionaryFile) {
      return;
    }

    let content = await plugin.app.vault.cachedRead(dictionaryFile);

    const escapeRegExp = (string: string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const taskLineRegex = new RegExp(
      `^- \\[ \\] ${escapeRegExp(firstUncompletedTask.originalTaskName)} ${
        plugin.settings.taskEstimateDelimiter
      } (.+)$`,
      'm'
    );
    const match = content.match(taskLineRegex);

    let recentTimes: number[] = [];
    let trimmedMean = elapsedTime;
    let median = elapsedTime;

    if (match) {
      const stats = match[1].split(',');
      if (stats.length > 2 && stats[2]) {
        const timesString = stats[2].split('%%')[1];
        if (timesString) {
          recentTimes = timesString.split('|').map(parseFloat);
        }
      }
    }

    recentTimes.push(elapsedTime);

    if (recentTimes.length > 20) {
      recentTimes.shift();
    }

    trimmedMean = calculateTrimmedMean(recentTimes);
    median = calculateMedian(recentTimes);

    const newLine = `- [ ] ${firstUncompletedTask.originalTaskName} ${
      plugin.settings.taskEstimateDelimiter
    } ${trimmedMean},Mean: ${trimmedMean} Median: ${median} Recent: ${elapsedTime},${
      firstUncompletedTask.task
    }%%${recentTimes.join('|')}%%`;

    if (match) {
      content = content.replace(taskLineRegex, newLine);
    } else {
      content += '\n' + newLine;
    }

    await plugin.app.vault.modify(dictionaryFile, content);
  };

  const calculateMedian = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    return Math.ceil(median);
  };

  const calculateTrimmedMean = (values: number[]): number => {
    if (values.length <= 2) return Math.ceil(calculateMedian(values));
    const sorted = [...values].sort((a, b) => a - b);
    sorted.pop();
    sorted.shift();
    const trimmedMean = sorted.reduce((a, b) => a + b) / sorted.length;
    return Math.ceil(trimmedMean);
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
