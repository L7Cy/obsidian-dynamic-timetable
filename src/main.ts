import { Plugin, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { DynamicTimetableSettingTab } from './settings';
import { TaskParser } from './TaskParser';
import { TimetableView } from './TimetableView';

export interface Task {
  task: string;
  startTime: Date | null;
  previousEndTime: Date | null;
  estimate: string | null;
  isChecked: boolean;
}

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
  taskParser: TaskParser;
  timetableView: TimetableView | null = null;

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
  };

  async onload() {
    console.log('DynamicTimetable: onload');

    this.settings = {
      ...DynamicTimetable.DEFAULT_SETTINGS,
      ...(await this.loadData()),
    };
    this.addSettingTab(new DynamicTimetableSettingTab(this.app, this));
    this.taskParser = TaskParser.fromSettings(this.settings);

    this.registerView('Timetable', (leaf: WorkspaceLeaf) => {
      this.timetableView = new TimetableView(leaf, this);
      return this.timetableView;
    });

    if (this.app.workspace.layoutReady) {
      this.initTimetableView();
    } else {
      this.registerEvent(
        this.app.workspace.on('layout-ready', this.initTimetableView.bind(this))
      );
    }
    this.registerCommands();
  }

  onunload(): void {
    this.closeTimetable();
  }

  async updateSetting<T extends keyof DynamicTimetableSettings>(
    settingName: T,
    newValue: DynamicTimetableSettings[T]
  ): Promise<void> {
    this.settings[settingName] = newValue;
    await this.saveData(this.settings);
    await this.updateOpenTimetableViews();
  }

  private registerCommands(): void {
    this.addCustomCommand('toggle-timetable', 'Show/Hide Timetable', () => {
      if (this.isTimetableOpen()) {
        this.closeTimetable();
      } else {
        this.openTimetable();
      }
    });

    this.addCustomCommand('init-timetable', 'Initialize Timetable', () =>
      this.initTimetableView()
    );

    this.addCustomCommand('complete-task', 'Complete Task', async () => {
      if (this.targetFile === null || this.taskParser === undefined) {
        return;
      }
      const content = await this.app.vault.read(this.targetFile);
      const task = this.taskParser.parseTasksFromContent(content)[0];
      if (task && this.timetableView) {
        await this.timetableView.completeTask(task);
      }
    });

    this.addCustomCommand('interrupt-task', 'Interrupt Task', async () => {
      if (this.targetFile === null) {
        return;
      }
      const content = await this.app.vault.read(this.targetFile);
      const task = this.taskParser.parseTasksFromContent(content)[0];
      if (task && this.timetableView) {
        await this.timetableView.interruptTask(task);
      }
    });
  }

  private addCustomCommand(id: string, name: string, callback: any) {
    this.addCommand({
      id: id,
      name: name,
      callback: callback,
    });
  }

  async initTimetableView() {
    if (!this.isTimetableOpen()) {
      this.openTimetable();
    } else {
      this.updateOpenTimetableViews(true);
    }
  }

  async updateOpenTimetableViews(scrollToFirstUncompleted: boolean = false) {
    for (const leaf of this.app.workspace.getLeavesOfType('Timetable')) {
      const view = leaf.view;
      if (view instanceof TimetableView) {
        this.checkTargetFile();
        await view.update(scrollToFirstUncompleted);
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
