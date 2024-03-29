import { Notice } from 'obsidian';
import DynamicTimetable from './main';
import { taskFunctions } from './TaskManager';

export class CommandsManager {
  private plugin: DynamicTimetable;

  constructor(plugin: DynamicTimetable) {
    this.plugin = plugin;
  }

  toggleTimetable(): void {
    const leaves = this.plugin.app.workspace.getLeavesOfType('Timetable');
    if (leaves.length == 0) {
      this.plugin.openTimetable();
    } else {
      this.plugin.app.workspace.detachLeavesOfType('Timetable');
    }
  }

  toggleStatistics(): void {
    const leaves = this.plugin.app.workspace.getLeavesOfType('Statistics');
    if (leaves.length == 0) {
      this.plugin.openStatistics();
    } else {
      this.plugin.app.workspace.detachLeavesOfType('Statistics');
    }
  }

  initializeTimetableView(): void {
    this.plugin.initTimetableView();
    this.plugin.timetableViewComponentRef.current?.scrollToFirstUncompletedTask();
    new Notice('Timetable initialized!', 1000);
  }

  completeTask(): void {
    const taskManager = taskFunctions(this.plugin);
    const firstUncompletedTask = this.plugin.tasks.find(
      (task) => !task.isCompleted
    );
    if (firstUncompletedTask) {
      taskManager.completeTask(firstUncompletedTask);
      this.plugin.timetableViewComponentRef.current?.scrollToFirstUncompletedTask();
    }
  }

  interruptTask(): void {
    const taskManager = taskFunctions(this.plugin);
    const firstUncompletedTask = this.plugin.tasks.find(
      (task) => !task.isCompleted
    );
    if (firstUncompletedTask) {
      taskManager.interruptTask();
      this.plugin.timetableViewComponentRef.current?.scrollToFirstUncompletedTask();
    }
  }
}
