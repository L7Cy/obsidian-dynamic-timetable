import {
  Plugin,
  WorkspaceLeaf,
  ItemView,
  App,
  TFile,
  PluginSettingTab,
  Setting,
  Notice,
} from 'obsidian';

interface Task {
  task: string;
  startTime: Date | null;
  estimate: string | null;
  isChecked: boolean;
}

interface DynamicTimetableSettings {
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
    showCompletedTasks: false,
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
      this.checkTargetFile();
      if (this.targetFile === null || this.taskParser === undefined) {
        return;
      }
      const content = await this.app.vault.read(this.targetFile);
      const task = this.taskParser.filterAndParseTasks(content)[0];
      if (task && this.timetableView) {
        await this.timetableView.completeTask(task);
      }
    });

    this.addCustomCommand('interrupt-task', 'Interrupt Task', async () => {
      if (this.targetFile === null) {
        return;
      }
      const content = await this.app.vault.read(this.targetFile);
      const task = this.taskParser.filterAndParseTasks(content)[0];
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
    const abstractFile = this.settings.filePath
      ? this.app.vault.getAbstractFileByPath(this.settings.filePath)
      : this.app.workspace.getActiveFile();

    if (abstractFile instanceof TFile) {
      this.targetFile = abstractFile;
    } else {
      this.targetFile = null;
      new Notice('No active file or active file is not a Markdown file');
    }
  }
}

class TimetableView extends ItemView {
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
    return task && this.plugin.targetFile
      ? (new Date().getTime() - this.plugin.targetFile.stat.mtime) / 1000
      : 0;
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

class TaskManager {
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
    console.log('completeTask called with task:', task);
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
    console.log('interruptTask called with task:', task);
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
    if (this.plugin.targetFile) {
      task.startTime = new Date(this.plugin.targetFile.stat.mtime);
    }
    let elapsedTime = task.startTime
      ? (new Date().getTime() - task.startTime.getTime()) / 60000
      : 0;
    return Math.floor(elapsedTime);
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

    const actualStartTime = startTime
      ? new Date(
          Date.now() - elapsedTime * TableRenderer.MILLISECONDS_IN_MINUTE
        )
      : null;

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
        if (actualStartTime) {
          newTaskLine += ` @ ${this.formatTime(actualStartTime)}`;
        }
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

class TableRenderer {
  public static readonly MILLISECONDS_IN_MINUTE = 60000;
  private static readonly LATE_CLASS = 'late';
  private static readonly ON_TIME_CLASS = 'on-time';
  private static readonly COMPLETED_CLASS = 'completed';
  private static readonly BUFFER_TIME_CLASS = 'dt-buffer-time';
  private static readonly BUFFER_TIME_NAME = 'Buffer Time';
  private static readonly COMPLETE_BUTTON_TEXT = '✅';
  private static readonly INTERRUPT_BUTTON_TEXT = '⏹️';
  private static readonly INIT_BUTTON_TEXT = '🔄';

  private plugin: DynamicTimetable;
  private contentEl: HTMLElement;
  private progressBarManager: ProgressBarManager;

  constructor(plugin: DynamicTimetable, contentEl: HTMLElement) {
    this.plugin = plugin;
    this.contentEl = contentEl;
    this.contentEl.classList.add('dt-content');
    this.progressBarManager = new ProgressBarManager(plugin, contentEl);
  }

  async renderTable(
    tasks: Task[],
    scrollToFirstUncompleted: boolean = false
  ): Promise<void> {
    this.contentEl.empty();
    if (this.plugin.settings.showProgressBar) {
      this.progressBarManager.createOrUpdateProgressBar(0, 0);
    }

    const buttonContainer = this.contentEl.createEl('div');
    buttonContainer.classList.add('dt-button-container');

    const initButton = this.createInitButton();
    const completeButton = this.createCompleteButton();
    const interruptButton = this.createInterruptButton();

    buttonContainer.appendChild(completeButton);
    buttonContainer.appendChild(interruptButton);
    buttonContainer.appendChild(initButton);

    const scheduleTable = this.initializeTable(tasks);

    this.contentEl.appendChild(buttonContainer);
    this.contentEl.appendChild(scheduleTable);

    if (scrollToFirstUncompleted) {
      const firstUncompletedTask = document.getElementById(
        'first-uncompleted-task'
      );
      if (firstUncompletedTask) {
        const stickyHeight = buttonContainer.getBoundingClientRect().height;
        this.contentEl.scrollTop =
          firstUncompletedTask.offsetTop - stickyHeight;
      }
    }
  }

  initializeTable(tasks: Task[]) {
    const scheduleTable = this.createTable();
    const tableHead = scheduleTable.createTHead();
    const tableBody = scheduleTable.createTBody();

    tableHead.appendChild(this.createTableHeader());
    this.appendTableBodyRows(tableBody, tasks);

    return scheduleTable;
  }

  createCompleteButton() {
    const completeButton = this.contentEl.createEl('button', {
      text: TableRenderer.COMPLETE_BUTTON_TEXT,
    });
    completeButton.classList.add('dt-button', 'dt-complete-button');
    completeButton.addEventListener('click', async () => {
      if (
        this.plugin.targetFile === null ||
        this.plugin.taskParser === undefined
      ) {
        new Notice('No tasks to complete!');
        return;
      }
      const content = await this.plugin.app.vault.read(this.plugin.targetFile);
      const task = this.plugin.taskParser.filterAndParseTasks(content)[0];
      if (task && this.plugin.timetableView) {
        try {
          await this.plugin.timetableView.completeTask(task);
        } catch (error) {
          new Notice('Task completion failed!');
        }
      } else {
        new Notice('No tasks to complete!');
      }
    });
    return completeButton;
  }

  createInterruptButton() {
    const interruptButton = this.contentEl.createEl('button', {
      text: TableRenderer.INTERRUPT_BUTTON_TEXT,
    });
    interruptButton.classList.add('dt-button', 'dt-interrupt-button');
    interruptButton.addEventListener('click', async () => {
      if (
        this.plugin.targetFile === null ||
        this.plugin.taskParser === undefined
      ) {
        new Notice('No tasks to interrupt!');
        return;
      }
      const content = await this.plugin.app.vault.read(this.plugin.targetFile);
      const task = this.plugin.taskParser.filterAndParseTasks(content)[0];
      if (task && this.plugin.timetableView) {
        try {
          await this.plugin.timetableView.interruptTask(task);
        } catch (error) {
          new Notice('Task interruption failed!');
        }
      } else {
        new Notice('No tasks to interrupt!');
      }
    });
    return interruptButton;
  }

  createInitButton() {
    const initButton = this.contentEl.createEl('button', {
      text: TableRenderer.INIT_BUTTON_TEXT,
    });
    initButton.classList.add('dt-button', 'dt-init-button');
    initButton.addEventListener('click', async () => {
      await this.plugin.initTimetableView();
      new Notice('Timetable initialized!');
    });
    return initButton;
  }

  private createTable(): HTMLTableElement {
    const table = this.contentEl.createEl('table');
    table.classList.add('dt-table');
    return table;
  }

  private createTableHeader(): HTMLTableRowElement {
    const { headerNames, showEstimate, showStartTime } = this.plugin.settings;
    const [
      taskHeaderName,
      estimateHeaderName,
      startTimeHeaderName,
      endHeaderName,
    ] = headerNames;

    const tableHeaderValues = [taskHeaderName];
    if (showEstimate) {
      tableHeaderValues.push(estimateHeaderName);
    }
    if (showStartTime) {
      tableHeaderValues.push(startTimeHeaderName);
    }
    tableHeaderValues.push(endHeaderName);
    return this.createTableRow(tableHeaderValues, true);
  }

  private appendTableBodyRows(
    tableBody: HTMLTableSectionElement,
    tasks: Task[]
  ): void {
    const { showEstimate, showStartTime, showCompletedTasks } =
      this.plugin.settings;

    let currentTaskEndTime = new Date();
    let previousEndTime: Date | null = null;
    let completedTaskRows: HTMLTableRowElement[] = [];
    let uncompletedTaskRows: HTMLTableRowElement[] = [];
    let hasFoundFirstUncompletedTask = false;

    for (const task of tasks) {
      const {
        task: parsedTaskName,
        estimate,
        startTime: taskStartTime,
        isChecked,
      } = task;
      const minutes =
        estimate !== null && estimate !== undefined ? parseInt(estimate) : null;
      let startTime: Date | null =
        !isChecked && !hasFoundFirstUncompletedTask
          ? currentTaskEndTime
          : taskStartTime
          ? new Date(taskStartTime)
          : null;
      let endTime: Date | null = null;
      let bufferMinutes = null;

      if (
        this.plugin.settings.showBufferTime &&
        taskStartTime &&
        (!hasFoundFirstUncompletedTask || previousEndTime) &&
        !isChecked
      ) {
        const compareTime = hasFoundFirstUncompletedTask
          ? previousEndTime
          : currentTaskEndTime;
        if (!compareTime) return;
        bufferMinutes = Math.ceil(
          (new Date(taskStartTime).getTime() - compareTime.getTime()) /
            TableRenderer.MILLISECONDS_IN_MINUTE
        );
        if (!hasFoundFirstUncompletedTask && bufferMinutes <= 0) {
          bufferMinutes = null;
        } else {
          const bufferRow = this.createBufferRow(bufferMinutes);
          uncompletedTaskRows.push(bufferRow);
        }
      }
      if (isChecked && showCompletedTasks) {
        if (minutes !== null) {
          if (!startTime) {
            startTime = new Date(
              currentTaskEndTime.getTime() -
                minutes * TableRenderer.MILLISECONDS_IN_MINUTE
            );
          }
          endTime = currentTaskEndTime;
        }

        const row = this.createTaskRow(
          parsedTaskName,
          minutes,
          startTime,
          endTime,
          bufferMinutes,
          showEstimate,
          showStartTime,
          isChecked
        );
        completedTaskRows.push(row);

        currentTaskEndTime = startTime!;
        continue;
      }

      if (!hasFoundFirstUncompletedTask) {
        currentTaskEndTime = new Date();

        startTime = startTime || currentTaskEndTime;
        if (minutes !== null) {
          endTime = new Date(
            startTime.getTime() + minutes * TableRenderer.MILLISECONDS_IN_MINUTE
          );
        }
      } else {
        if (minutes !== null && previousEndTime) {
          startTime = startTime || previousEndTime;
          endTime = new Date(
            startTime.getTime() + minutes * TableRenderer.MILLISECONDS_IN_MINUTE
          );
        }
      }

      if (!isChecked || (isChecked && showCompletedTasks)) {
        if (startTime && endTime) {
          const row = this.createTaskRow(
            parsedTaskName,
            minutes,
            startTime,
            endTime,
            bufferMinutes,
            showEstimate,
            showStartTime,
            isChecked
          );
          if (!hasFoundFirstUncompletedTask) {
            row.id = 'first-uncompleted-task';
            hasFoundFirstUncompletedTask = true;
          }
          uncompletedTaskRows.push(row);
        }
        if (!hasFoundFirstUncompletedTask) {
          hasFoundFirstUncompletedTask = true;
        }
        previousEndTime = endTime;
      }
    }

    completedTaskRows.reverse().forEach((row) => tableBody.appendChild(row));

    uncompletedTaskRows.forEach((row) => tableBody.appendChild(row));
  }

  private createTaskRow(
    taskName: string,
    minutes: number | null,
    startTime: Date | null,
    endTime: Date | null,
    bufferMinutes: number | null,
    showEstimate: boolean,
    showStartTime: boolean,
    isChecked: boolean
  ): HTMLTableRowElement {
    let rowClass = null;
    if (isChecked) {
      rowClass = TableRenderer.COMPLETED_CLASS;
    } else if (bufferMinutes !== null) {
      rowClass =
        bufferMinutes < 0
          ? TableRenderer.LATE_CLASS
          : TableRenderer.ON_TIME_CLASS;
    }
    const tableRowValues = [taskName];
    if (showEstimate && minutes !== null) {
      tableRowValues.push(`${minutes}m`);
    }
    if (showStartTime && startTime) {
      tableRowValues.push(this.formatTime(startTime));
    }
    if (endTime) {
      tableRowValues.push(this.formatTime(endTime));
    }
    const taskRow = this.createTableRow(tableRowValues, false, rowClass);
    return taskRow;
  }

  private createBufferRow(bufferMinutes: number): HTMLTableRowElement {
    const bufferRow = document.createElement('tr');
    bufferRow.classList.add(TableRenderer.BUFFER_TIME_CLASS);
    const bufferNameCell = this.createTableCell(TableRenderer.BUFFER_TIME_NAME);
    bufferRow.appendChild(bufferNameCell);
    const bufferTimeCell = document.createElement('td');
    bufferTimeCell.textContent = `${bufferMinutes}m`;
    bufferTimeCell.setAttribute('colspan', '3');
    bufferRow.appendChild(bufferTimeCell);
    return bufferRow;
  }

  private createTableCell(value: string, isHeader = false): HTMLElement {
    const cell = document.createElement(isHeader ? 'th' : 'td');
    cell.textContent = value;
    return cell;
  }

  private createTableRow(
    rowValues: string[],
    isHeader = false,
    rowClass: string | null = null
  ): HTMLTableRowElement {
    const row = document.createElement('tr');
    if (rowClass) {
      row.classList.add(rowClass);
    }
    rowValues.forEach((value) => {
      const cell = this.createTableCell(value, isHeader);
      row.appendChild(cell);
    });
    return row;
  }

  private formatTime(date: Date): string {
    return new Intl.DateTimeFormat(navigator.language, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }
}

class ProgressBarManager {
  private overdueNotice: Notice | null = null;
  private static readonly PROGRESS_BAR_CLASS = 'dt-progress-bar';
  private static readonly PROGRESS_BAR_OVERDUE_CLASS =
    'dt-progress-bar-overdue';

  private plugin: DynamicTimetable;
  private contentEl: HTMLElement;

  constructor(plugin: DynamicTimetable, contentEl: HTMLElement) {
    this.plugin = plugin;
    this.contentEl = contentEl;
  }

  createOrUpdateProgressBar(duration: number, estimate: number): void {
    let progressBarContainer = this.contentEl.querySelector(
      '.' + ProgressBarManager.PROGRESS_BAR_CLASS + '-container'
    ) as HTMLElement;
    if (!progressBarContainer) {
      progressBarContainer = this.contentEl.createEl('div');
      progressBarContainer.addClass(
        ProgressBarManager.PROGRESS_BAR_CLASS + '-container'
      );
    }
    let progressBar = progressBarContainer.querySelector(
      '.' + ProgressBarManager.PROGRESS_BAR_CLASS
    ) as HTMLElement;
    if (!progressBar) {
      progressBar = progressBarContainer.createEl('div');
      progressBar.addClass(ProgressBarManager.PROGRESS_BAR_CLASS);
    }
    const width = Math.min((duration / estimate) * 100, 100);
    this.updateProgressBarStyle(progressBar, width);
  }

  private updateProgressBarStyle(
    progressBar: HTMLElement,
    width: number
  ): void {
    progressBar.style.width = width + '%';
    if (width === 100) {
      progressBar.addClass(ProgressBarManager.PROGRESS_BAR_OVERDUE_CLASS);
      this.createNotice();
    } else {
      progressBar.removeClass(ProgressBarManager.PROGRESS_BAR_OVERDUE_CLASS);
      if (this.overdueNotice) {
        this.overdueNotice.hide();
        this.overdueNotice = null;
      }
    }
  }

  private createNotice(): void {
    if (!this.overdueNotice && this.plugin.settings.enableOverdueNotice) {
      this.overdueNotice = new Notice('Are you finished?', 0);
    }
  }
}

class TaskParser {
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

    for (let line of lines) {
      if (new RegExp(this.dateDelimiter).test(line)) {
        nextDay += 1;
        continue;
      }

      if (
        !line.startsWith('- [ ]') &&
        !line.startsWith('+ [ ]') &&
        !line.startsWith('* [ ]') &&
        (!this.showCompletedTasks ||
          (!line.startsWith('- [x]') &&
            !line.startsWith('+ [x]') &&
            !line.startsWith('* [x]')))
      ) {
        continue;
      }

      if (
        !line.includes(this.separator) &&
        !line.includes(this.startTimeDelimiter)
      ) {
        continue;
      }

      const taskName = this.parseTaskName(line);
      const startTime = this.parseStartTime(line, currentDate, nextDay);
      const estimate = this.parseEstimate(line);
      const isChecked =
        line.startsWith('- [x]') ||
        line.startsWith('+ [x]') ||
        line.startsWith('* [x]');

      const task = {
        task: taskName,
        startTime: startTime,
        estimate: estimate,
        isChecked: isChecked,
      };

      if (isChecked) {
        completedTasks.unshift(task);
      } else {
        uncompletedTasks.push(task);
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
      const timeSplit =
        timeMatch[1].split(':').length == 1
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

class DynamicTimetableSettingTab extends PluginSettingTab {
  plugin: DynamicTimetable;

  constructor(app: App, plugin: DynamicTimetable) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    this.createSetting(
      'File Path',
      'Enter the path to the Markdown file to get task list from. Leave blank to use active file.',
      'filePath',
      'text',
      '/path/to/target/file.md'
    );
    this.createSetting('Show Estimate Column', '', 'showEstimate', 'toggle');
    this.createSetting('Show Start Time Column', '', 'showStartTime', 'toggle');
    this.createSetting(
      'Show Estimate in Task Name',
      '',
      'showEstimateInTaskName',
      'toggle'
    );
    this.createSetting(
      'Show Start Time in Task Name',
      '',
      'showStartTimeInTaskName',
      'toggle'
    );
    this.createSetting('Show Buffer Time Rows', '', 'showBufferTime', 'toggle');
    this.createSetting(
      'Task/Estimate Delimiter',
      '',
      'taskEstimateDelimiter',
      'text',
      ';'
    );
    this.createSetting(
      'Start Time Delimiter',
      '',
      'startTimeDelimiter',
      'text',
      '@'
    );

    const headerNames = this.plugin.settings.headerNames.join(', ');
    this.createSetting(
      'Header Names',
      'Enter header names, separated by commas.',
      'headerNames',
      'text',
      headerNames
    );

    this.createSetting(
      'Show Progress Bar',
      'If enabled, displays a progress bar based on the top task estimate.',
      'showProgressBar',
      'toggle'
    );
    if (this.plugin.settings.showProgressBar) {
      this.createSetting(
        'Interval Time (Seconds)',
        'Set the interval for updating the progress bar.',
        'intervalTime',
        'text',
        '1'
      );
    }
    this.createSetting(
      'Date Delimiter',
      'Enter a regex that matches the delimiter for a new day.',
      'dateDelimiter',
      'text',
      '^---$'
    );
    this.createSetting(
      'Enable Overdue Notice',
      '',
      'enableOverdueNotice',
      'toggle'
    );
    this.createSetting(
      'Show Completed Tasks',
      'If enabled, displays completed tasks in the timetable.',
      'showCompletedTasks',
      'toggle'
    );
  }

  /**
   * Creates a new setting with the given parameters.
   * @param {string} name - The name of the setting.
   * @param {string} desc - The description of the setting.
   * @param {string} key - The key for the setting.
   * @param {'text' | 'toggle'} type - The type of the setting.
   * @param {string} [placeholder] - The placeholder for the setting.
   */
  createSetting(
    name: string,
    desc: string,
    key: string,
    type: 'text' | 'toggle',
    placeholder?: string
  ) {
    if (key === 'headerNames') {
      this.createHeaderNamesSetting(placeholder || '');
      return;
    }

    if (type === 'text') {
      this.createTextSetting(name, desc, key, placeholder);
    } else if (type === 'toggle') {
      this.createToggleSetting(name, desc, key);
    }
  }

  createTextSetting(
    name: string,
    desc: string,
    key: string,
    placeholder?: string
  ) {
    const setting = new Setting(this.containerEl).setName(name).setDesc(desc);
    setting.addText((text) => {
      const el = text
        .setPlaceholder(placeholder || '')
        .setValue((this.plugin.settings[key] as string) || '');
      el.inputEl.addEventListener('blur', async (event) => {
        const value = (event.target as HTMLInputElement).value;
        await this.plugin.updateSetting(key, value);
      });
      return el;
    });
  }

  createToggleSetting(name: string, desc: string, key: string) {
    const setting = new Setting(this.containerEl).setName(name).setDesc(desc);
    setting.addToggle((toggle) =>
      toggle
        .setValue(!!(this.plugin.settings[key] as boolean))
        .onChange(async (value) => {
          await this.plugin.updateSetting(key, value);
          this.display();
        })
    );
  }

  createHeaderNamesSetting(headerNames: string) {
    new Setting(this.containerEl).setName('Header Names').addText((text) => {
      const el = text.setValue(headerNames);
      el.inputEl.style.width = '-webkit-fill-available';
      el.inputEl.addEventListener('blur', async (event) => {
        const value = (event.target as HTMLInputElement).value
          .split(',')
          .map((s) => s.trim());
        await this.plugin.updateSetting('headerNames', value);
        this.display();
      });
      return el;
    });
  }
}
