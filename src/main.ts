import { Plugin, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { TimetableView } from './TimetableView';
import { DynamicTimetableSettingTab } from './Settings';
import { taskFunctions } from './TaskManager';
import { Task } from './TaskParser';
import { CommandsManager } from './Commands';
import { TimetableViewComponentRef } from './TimetableViewComponent';
import React from 'react';
import { StatisticsView } from './StatisticsView';

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
  categoryColors: { category: string; color: string }[];
  categoryTransparency: number;
  pathToDictionary: string;
  showRemainingTime: boolean;
  [key: string]:
    | string
    | boolean
    | string[]
    | number
    | null
    | undefined
    | { category: string; color: string }[];
}

type ViewType = 'Timetable' | 'Statistics';

export default class DynamicTimetable extends Plugin {
  settings: DynamicTimetableSettings;
  targetFile: TFile | null = null;
  tasks: Task[] = [];

  private commandsManager: CommandsManager;
  timetableViewComponentRef: React.RefObject<TimetableViewComponentRef>;
  categoryBackgroundColors: Record<string, string> = {};
  isCategoryColorsReady: boolean = false;

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
    categoryColors: [],
    categoryTransparency: 0.3,
    pathToDictionary: '',
    showRemainingTime: false,
  };

  async onload() {
    console.log('DynamicTimetable: onload');
    await this.initSettings();
    this.initCommands();
    this.registerViews();
    await this.layoutReadyHandler();
  }

  async initSettings() {
    this.settings = {
      ...DynamicTimetable.DEFAULT_SETTINGS,
      ...(await this.loadData()),
    };
    this.addSettingTab(new DynamicTimetableSettingTab(this.app, this));
    this.commandsManager = new CommandsManager(this);
  }

  async layoutReadyHandler() {
    if (this.app.workspace.layoutReady) {
      this.initTimetableView();
    } else {
      this.app.workspace.onLayoutReady(this.initTimetableView.bind(this));
    }
    this.timetableViewComponentRef =
      React.createRef<TimetableViewComponentRef>();
  }

  registerViews() {
    this.registerView(
      'Timetable',
      (leaf: WorkspaceLeaf) => new TimetableView(leaf, this)
    );
    this.registerView(
      'Statistics',
      (leaf: WorkspaceLeaf) => new StatisticsView(leaf, this)
    );
  }

  initCommands(): void {
    this.addCommand({
      id: 'toggle-timetable',
      name: 'Show/Hide Timetable',
      callback: () => this.commandsManager.toggleTimetable(),
    });

    this.addCommand({
      id: 'toggle-statistics',
      name: 'Show/Hide Statistics',
      callback: () => this.commandsManager.toggleStatistics(),
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
    await this.updateOpenViews('Timetable');
  }

  async initTimetableView() {
    this.isCategoryColorsReady = false;
    if (!this.isTimetableOpen()) {
      this.openTimetable();
    } else {
      this.updateOpenViews('Timetable');
    }
    while (!this.isCategoryColorsReady) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!this.isStatisticsOpen()) {
      this.openStatistics();
    } else {
      this.updateOpenViews('Statistics');
    }
    const taskManager = taskFunctions(this);
    const newTasks = await taskManager.initializeTasks();
    this.tasks = newTasks;
  }

  async updateOpenViews(viewType: ViewType) {
    const viewTypeMap: Record<
      ViewType,
      typeof TimetableView | typeof StatisticsView
    > = {
      Timetable: TimetableView,
      Statistics: StatisticsView,
    };

    for (const leaf of this.app.workspace.getLeavesOfType(viewType)) {
      const view = leaf.view;
      if (view instanceof viewTypeMap[viewType]) {
        this.checkTargetFile();
        await (view as any).update();
      }
    }
  }

  isTimetableOpen(): boolean {
    return this.app.workspace.getLeavesOfType('Timetable').length > 0;
  }

  isStatisticsOpen(): boolean {
    return this.app.workspace.getLeavesOfType('Statistics').length > 0;
  }

  async openTimetable() {
    this.checkTargetFile();
    const leaf = this.app.workspace.getRightLeaf(false);
    leaf.setViewState({ type: 'Timetable' });
    this.app.workspace.revealLeaf(leaf);
  }

  async openStatistics() {
    this.checkTargetFile();
    const leaf = this.app.workspace.getRightLeaf(false);
    leaf.setViewState({ type: 'Statistics' });
    this.app.workspace.revealLeaf(leaf);
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
