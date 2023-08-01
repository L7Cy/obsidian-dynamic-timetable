import { DynamicTimetableSettings, Task } from './main';

export class TaskParser {
  private static readonly TASK_NAME_REGEX = /^[-+*]\s*\[\s*.\s*\]/;
  private static readonly LINK_REGEX = /\[\[([^\[\]]*\|)?([^\[\]]+)\]\]/g;
  private static readonly MARKDOWN_LINK_REGEX = /\[([^\[\]]+)\]\(.+?\)/g;

  private taskNameRegex: RegExp;
  private linkRegex: RegExp;
  private markdownLinkRegex: RegExp;
  public estimateRegex: RegExp;
  public timeRegex: RegExp;
  private dateTimeRegex: RegExp;
  private dateDelimiter: RegExp;

  constructor(
    private separator: string,
    private startTimeDelimiter: string,
    dateDelimiter: string,
    private showStartTimeInTaskName: boolean,
    private showEstimateInTaskName: boolean,
    private showCompletedTasks: boolean
  ) {
    this.taskNameRegex = TaskParser.TASK_NAME_REGEX;
    this.linkRegex = TaskParser.LINK_REGEX;
    this.markdownLinkRegex = TaskParser.MARKDOWN_LINK_REGEX;
    this.estimateRegex = new RegExp(`\\${separator}\\s*\\d+\\s*`);
    this.timeRegex = new RegExp(
      `\\${startTimeDelimiter}\\s*(\\d{1,2}\\:?\\d{2})`
    );
    this.dateTimeRegex = new RegExp(
      `\\${startTimeDelimiter}\\s*(\\d{4}-\\d{2}-\\d{2}T\\d{1,2}\\:?\\d{2})`
    );
    this.dateDelimiter = dateDelimiter ? new RegExp(dateDelimiter) : /(?!x)x/;
    this.showCompletedTasks = showCompletedTasks;
  }

  static fromSettings(settings: DynamicTimetableSettings): TaskParser {
    return new TaskParser(
      settings.taskEstimateDelimiter,
      settings.startTimeDelimiter,
      settings.dateDelimiter,
      settings.showStartTimeInTaskName,
      settings.showEstimateInTaskName,
      settings.showCompletedTasks
    );
  }

  public getTopUncompletedTask(content: string): Task | null {
    const tasks = this.filterAndParseTasks(content);
    for (const task of tasks) {
      if (!task.isChecked) {
        return task;
      }
    }
    return null;
  }

  public filterAndParseTasks(content: string): Task[] {
    const lines = content.split('\n').map((line) => line.trim());
    const currentDate = new Date();
    let nextDay = 0;

    let completedTasks: Task[] = [];
    let uncompletedTasks: Task[] = [];

    let previousEndTime: Date | null = null;
    let foundTask = false;

    for (let line of lines) {
      if (new RegExp(this.dateDelimiter).test(line)) {
        if (foundTask) {
          nextDay += 1;
        }
        continue;
      }

      if (!line.startsWith('- [ ]') &&
        !line.startsWith('+ [ ]') &&
        !line.startsWith('* [ ]') &&
        !line.startsWith('- [x]') &&
        !line.startsWith('+ [x]') &&
        !line.startsWith('* [x]')) {
        continue;
      }

      if (!line.includes(this.separator) &&
        !line.includes(this.startTimeDelimiter)) {
        continue;
      }

      const taskName = this.parseTaskName(line);
      const startTime = this.parseStartTime(line, currentDate, nextDay);
      const estimate = this.parseEstimate(line);
      const isChecked = line.startsWith('- [x]') ||
        line.startsWith('+ [x]') ||
        line.startsWith('* [x]');

      const task = {
        task: taskName,
        startTime: startTime,
        previousEndTime: previousEndTime,
        estimate: estimate,
        isChecked: isChecked,
      };

      if (isChecked) {
        completedTasks.unshift(task);
      } else {
        uncompletedTasks.push(task);
      }

      foundTask = true;

      if (startTime !== null && estimate !== null) {
        const estimateInMilliseconds = Number(estimate) * 60 * 1000;
        previousEndTime = new Date(
          startTime.getTime() + estimateInMilliseconds
        );
      }
    }

    return [...uncompletedTasks, ...completedTasks];
  }

  public parseTaskName(taskName: string): string {
    taskName = taskName
      .replace(this.taskNameRegex, '')
      .trim()
      .replace(this.linkRegex, '$2')
      .replace(this.markdownLinkRegex, '$1')
      .trim();

    const startTimeRegex = new RegExp(
      `\\${this.startTimeDelimiter}\\s*(?:\\d{4}-\\d{2}-\\d{2}T)?(\\d{1,2}\\:?\\d{2})`
    );

    if (this.showStartTimeInTaskName) {
      taskName = taskName.replace(
        startTimeRegex,
        (match, p1) => `${this.startTimeDelimiter}${p1}`
      );
    } else {
      taskName = taskName.replace(startTimeRegex, '').trim();
    }

    if (!this.showEstimateInTaskName) {
      taskName = taskName.replace(this.estimateRegex, '').trim();
    }

    return taskName;
  }

  public parseStartTime(
    task: string,
    currentDate: Date,
    nextDay: number
  ): Date | null {
    const timeMatch = task.match(this.timeRegex);
    const dateTimeMatch = task.match(this.dateTimeRegex);

    if (dateTimeMatch) {
      const parsedDateTime = new Date(dateTimeMatch[1]);
      if (!isNaN(parsedDateTime.getTime())) {
        return parsedDateTime;
      }
    } else if (timeMatch) {
      const timeSplit = timeMatch[1].split(':').length == 1
        ? timeMatch[1].length == 3
          ? [timeMatch[1].substring(0, 1), timeMatch[1].substring(1, 3)]
          : [timeMatch[1].substring(0, 2), timeMatch[1].substring(2, 4)]
        : timeMatch[1].split(':');
      const [hours, minutes] = timeSplit.map(Number);

      const startDate = new Date(currentDate.getTime());
      startDate.setDate(startDate.getDate() + nextDay);
      startDate.setHours(hours, minutes, 0, 0);

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
