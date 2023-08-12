import { Plugin, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { TimetableView } from './TimetableView';
import { DynamicTimetableSettingTab } from './Settings';
import { taskFunctions } from './TaskManager';
import { Task } from './TaskParser';
import { CommandsManager } from './Commands';
import { TimetableViewComponentRef } from './TimetableViewComponent';
import React from 'react';

export interface DynamicTimetableSettings {
  filePath: string | null;
  showEstimate: boolean;
  showStartTime: boolean;
  showEstimateInTaskName: boolean;
  showStartTimeInTaskName: boolean;
  showBufferTime: boolean;
  showProgressBar: boolean;
  intervalTime: number;
  taskEstimateDelimiter: string;
  startTimeDelimiter: string;
  headerNames: string[];
  dateDelimiter: string;
  enableOverdueNotice: boolean;
  showCompletedTasks: boolean;
  applyBackgroundColorByCategory: boolean;
  showCategoryNamesInTask: boolean;
  [key: string]: string | boolean | string[] | number | null | undefined;
}

declare module 'obsidian' {
  interface Workspace {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(eventName: 'layout-ready', callback: () => any, ctx?: any): EventRef;
  }
}

export default class DynamicTimetable extends Plugin {
  settings: DynamicTimetableSettings;
  targetFile: TFile | null = null;
  tasks: Task[] = [];

  private commandsManager: CommandsManager;
  timetableViewComponentRef: React.RefObject<TimetableViewComponentRef>;

  static DEFAULT_SETTINGS: DynamicTimetableSettings = {
    filePath: null,
    showEstimate: false,
    showStartTime: false,
    showEstimateInTaskName: false,
    showStartTimeInTaskName: true,
    showBufferTime: true,
    showProgressBar: true,
    intervalTime: 1,
    taskEstimateDelimiter: ';',
    startTimeDelimiter: '@',
    dateDelimiter: '',
    enableOverdueNotice: true,
    headerNames: ['Tasks', 'Estimate', 'Start', 'End'],
    showCompletedTasks: true,
    applyBackgroundColorByCategory: true,
    showCategoryNamesInTask: false,
  };

  onunload(): void {
    this.closeTimetable();
  }

  async onload() {
    console.log('DynamicTimetable: onload');

    this.settings = {
      ...DynamicTimetable.DEFAULT_SETTINGS,
      ...(await this.loadData()),
    };
    this.addSettingTab(new DynamicTimetableSettingTab(this.app, this));

    this.commandsManager = new CommandsManager(this);
    this.initCommands();
    this.registerView(
      'Timetable',
      (leaf: WorkspaceLeaf) => new TimetableView(leaf, this)
    );

    if (this.app.workspace.layoutReady) {
      this.initTimetableView();
    } else {
      this.registerEvent(
        this.app.workspace.on('layout-ready', this.initTimetableView.bind(this))
      );
    }
    this.timetableViewComponentRef =
      React.createRef<TimetableViewComponentRef>();
  }

  initCommands(): void {
    this.addCommand({
      id: 'toggle-timetable',
      name: 'Show/Hide Timetable',
      callback: () => this.commandsManager.toggleTimetable(),
    });

    this.addCommand({
      id: 'init-timetable-view',
      name: 'Initialize Timetable View',
      callback: () => this.commandsManager.initializeTimetableView(),
    });

    this.addCommand({
      id: 'complete-task',
      name: 'Complete Task',
      callback: () => this.commandsManager.completeTask(),
    });

    this.addCommand({
      id: 'interrupt-task',
      name: 'Interrupt Task',
      callback: () => this.commandsManager.interruptTask(),
    });
  }

  async updateSetting<T extends keyof DynamicTimetableSettings>(
    settingName: T,
    newValue: DynamicTimetableSettings[T]
  ): Promise<void> {
    this.settings[settingName] = newValue;
    await this.saveData(this.settings);
    await this.updateOpenTimetableViews();
  }

  async initTimetableView() {
    if (!this.isTimetableOpen()) {
      this.openTimetable();
    } else {
      this.updateOpenTimetableViews();
    }
    const taskManager = taskFunctions(this);
    const newTasks = await taskManager.initializeTasks();
    this.tasks = newTasks;
  }

  async updateOpenTimetableViews() {
    for (const leaf of this.app.workspace.getLeavesOfType('Timetable')) {
      const view = leaf.view;
      if (view instanceof TimetableView) {
        this.checkTargetFile();
        await view.update();
      }
    }
  }

  isTimetableOpen(): boolean {
    return this.app.workspace.getLeavesOfType('Timetable').length > 0;
  }

  async openTimetable() {
    this.checkTargetFile();
    const leaf = this.app.workspace.getRightLeaf(false);
    leaf.setViewState({ type: 'Timetable' });
    this.app.workspace.revealLeaf(leaf);
  }

  closeTimetable() {
    this.app.workspace.detachLeavesOfType('Timetable');
  }

  checkTargetFile() {
    const abstractFile =
      this.targetFile === null && this.settings.filePath
        ? this.app.vault.getAbstractFileByPath(this.settings.filePath)
        : this.app.workspace.getActiveFile();

    if (abstractFile instanceof TFile) {
      if (this.targetFile !== abstractFile) {
        this.targetFile = abstractFile;
        this.updateFilePathSetting(abstractFile.path);
      }
    } else {
      this.targetFile = null;
      new Notice('No active file or active file is not a Markdown file');
    }
  }

  async updateFilePathSetting(newPath: string): Promise<void> {
    this.settings.filePath = newPath;
    await this.saveData(this.settings);
  }
}
