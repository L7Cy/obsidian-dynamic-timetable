import { TaskParser } from './TaskParser';
import { TableRenderer } from './TableRenderer';
import DynamicTimetable, { Task } from './main';

export class TaskManager {
  private taskParser: TaskParser;
  private plugin: DynamicTimetable;

  constructor(plugin: DynamicTimetable) {
    this.plugin = plugin;
  }

  async initializeTasks() {
    if (!this.plugin.targetFile) {
      return [];
    }
    const content = await this.plugin.app.vault.cachedRead(
      this.plugin.targetFile
    );
    this.taskParser = TaskParser.fromSettings(this.plugin.settings);
    let tasks = this.taskParser.filterAndParseTasks(content);

    if (tasks.length > 0 && tasks[0].startTime === null) {
      tasks[0].startTime = new Date(this.plugin.targetFile.stat.mtime);
    }
    return tasks;
  }

  async completeTask(task: Task): Promise<void> {
    if (!this.plugin.targetFile || !task.estimate) {
      return;
    }

    let content = await this.plugin.app.vault.cachedRead(
      this.plugin.targetFile
    );
    let elapsedTime = this.getElapsedTime(task);
    content = this.updateTaskInContent(content, task, elapsedTime);

    await this.plugin.app.vault.modify(this.plugin.targetFile, content);
  }

  async interruptTask(task: Task): Promise<void> {
    if (!this.plugin.targetFile || !task.estimate) {
      return;
    }

    let content = await this.plugin.app.vault.cachedRead(
      this.plugin.targetFile
    );
    let elapsedTime = this.getElapsedTime(task);
    let remainingTime = Math.max(
      0,
      Math.floor(parseFloat(task.estimate) - elapsedTime)
    );
    content = this.updateTaskInContent(
      content,
      task,
      elapsedTime,
      remainingTime
    );

    await this.plugin.app.vault.modify(this.plugin.targetFile, content);
  }

  private getElapsedTime(task: Task): number {
    const startTime = task.previousEndTime || null;

    if (!startTime) {
      return 0;
    }

    let elapsedTimeInMinutes = (Date.now() - startTime.getTime()) / 60000;

    if (elapsedTimeInMinutes < 0) {
      elapsedTimeInMinutes += 24 * 60;
    }

    return Math.max(0, Math.floor(elapsedTimeInMinutes));
  }

  private updateTaskInContent(
    content: string,
    task: Task,
    elapsedTime: number,
    remainingTime?: number
  ): string {
    let startTime = task.task.match(
      new RegExp(`\\s*@\\s*(\\d{1,2}[:]?\\d{2})\\s*$`)
    );

    if (startTime && startTime[1].length === 4) {
      startTime[1] = startTime[1].slice(0, 2) + ':' + startTime[1].slice(2);
    }

    const actualStartTime = new Date(
      Date.now() - elapsedTime * TableRenderer.MILLISECONDS_IN_MINUTE
    );

    const taskRegex = new RegExp(
      `^- \\[ \\] (.+?)(\\s*${this.plugin.settings.taskEstimateDelimiter.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      )}\\s*${task.estimate}|\\s*@\\s*\\d{1,2}[:]?\\d{2})`,
      'm'
    );

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const taskMatch = lines[i].match(taskRegex);
      if (taskMatch) {
        const originalTaskName = taskMatch[1];
        let newTaskLine = `- [x] ${originalTaskName} ${
          this.plugin.settings.taskEstimateDelimiter
        } ${elapsedTime.toFixed(0)}`;

        newTaskLine += ` @ ${this.formatTime(actualStartTime)}`;

        if (remainingTime !== undefined) {
          newTaskLine += `\n- [ ] ${originalTaskName} ${
            this.plugin.settings.taskEstimateDelimiter
          } ${remainingTime.toFixed(0)}`;
        }
        lines[i] = newTaskLine;
        break;
      }
    }
    return lines.join('\n');
  }

  private formatTime(date: Date): string {
    let hours = date.getHours();
    let minutes = date.getMinutes();

    if (minutes === 0) {
      return `${hours.toString().padStart(2, '0')}00`;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}`;
  }
}
