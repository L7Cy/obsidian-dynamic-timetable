import { WorkspaceLeaf, ItemView, Notice } from 'obsidian';
import { TableRenderer } from './TableRenderer';
import { ProgressBarManager } from './ProgressBarManager';
import { TaskManager } from './TaskManager';
import DynamicTimetable, { Task } from './main';

export class TimetableView extends ItemView {
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private overdueNotice: Notice | null = null;

  private taskManager: TaskManager;
  private tableRenderer: TableRenderer;
  private progressBarManager: ProgressBarManager;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: DynamicTimetable
  ) {
    super(leaf);
    this.containerEl.addClass('Timetable');

    this.taskManager = new TaskManager(plugin);
    this.tableRenderer = new TableRenderer(plugin, this.containerEl);
    this.progressBarManager = new ProgressBarManager(plugin, this.containerEl);

    plugin.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (file === this.plugin.targetFile) {
          this.update();
        }
      })
    );
  }

  getViewType(): string {
    return 'Timetable';
  }

  getDisplayText(): string {
    return 'Timetable';
  }

  async onOpen(): Promise<void> {
    await this.update(true);
  }

  async onClose(): Promise<void> {
    this.clearInterval();
  }

  private clearInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    if (this.overdueNotice) {
      this.overdueNotice.hide();
      this.overdueNotice = null;
    }
  }

  async update(scrollToFirstUncompleted: boolean = false) {
    if (!this.plugin.targetFile) {
      return;
    }
    let tasks = await this.taskManager.initializeTasks();
    await this.tableRenderer.renderTable(tasks, scrollToFirstUncompleted);
    this.setupInterval(tasks);
  }

  setupInterval(tasks: Task[]) {
    if (tasks.length === 0) {
      return;
    }
    this.clearInterval();

    this.intervalId = setInterval(() => {
      this.updateProgressBar(tasks[0]);
    }, this.plugin.settings.intervalTime * 1000);
  }

  private updateProgressBar(topTask: Task): void {
    const duration = this.getDuration(topTask);
    const topTaskEstimate = Number(topTask.estimate) * 60 || 0;
    this.progressBarManager.createOrUpdateProgressBar(
      duration,
      topTaskEstimate
    );
  }

  private getDuration(task: Task): number {
    if (task && this.plugin.targetFile && task.previousEndTime) {
      let duration =
        (new Date().getTime() - new Date(task.previousEndTime).getTime()) /
        1000;

      if (duration < 0) {
        duration += 24 * 60 * 60;
      }

      return duration;
    } else {
      return 0;
    }
  }

  async completeTask(task: Task): Promise<void> {
    await this.taskManager.completeTask(task);
    this.update(true);
  }

  async interruptTask(task: Task): Promise<void> {
    await this.taskManager.interruptTask(task);
    this.update(true);
  }
}
