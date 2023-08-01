import { Notice, setIcon } from 'obsidian';
import DynamicTimetable, { Task } from './main';
import { ProgressBarManager } from './ProgressBarManager';

export class TableRenderer {
  public static readonly MILLISECONDS_IN_MINUTE = 60000;
  private static readonly LATE_CLASS = 'late';
  private static readonly ON_TIME_CLASS = 'on-time';
  private static readonly COMPLETED_CLASS = 'dt-completed';
  private static readonly BUFFER_TIME_CLASS = 'dt-buffer-time';
  private static readonly BUFFER_TIME_NAME = 'Buffer Time';

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

  private createButton(options: {
    classNames: string[];
    icon: string;
    onClick: () => Promise<void>;
    noticeMessage: string;
  }): HTMLElement {
    const button = this.contentEl.createEl('button');
    button.classList.add('dt-button', ...options.classNames);
    setIcon(button, options.icon);
    button.addEventListener('click', async () => {
      try {
        await options.onClick();
      } catch (error) {
        new Notice(options.noticeMessage);
      }
    });
    return button;
  }

  public createCompleteButton() {
    return this.createButton({
      classNames: ['dt-complete-button'],
      icon: 'check-circle',
      onClick: async () => {
        if (
          this.plugin.targetFile === null ||
          this.plugin.taskParser === undefined
        ) {
          throw new Error();
        }
        const content = await this.plugin.app.vault.read(
          this.plugin.targetFile
        );
        const task = this.plugin.taskParser.parseTasksFromContent(content)[0];
        if (task && this.plugin.timetableView) {
          await this.plugin.timetableView.completeTask(task);
        } else {
          throw new Error();
        }
      },
      noticeMessage: 'No tasks to complete!',
    });
  }

  public createInterruptButton() {
    return this.createButton({
      classNames: ['dt-interrupt-button'],
      icon: 'circle-slash',
      onClick: async () => {
        if (
          this.plugin.targetFile === null ||
          this.plugin.taskParser === undefined
        ) {
          throw new Error();
        }
        const content = await this.plugin.app.vault.read(
          this.plugin.targetFile
        );
        const task = this.plugin.taskParser.parseTasksFromContent(content)[0];
        if (task && this.plugin.timetableView) {
          await this.plugin.timetableView.interruptTask(task);
        } else {
          throw new Error();
        }
      },
      noticeMessage: 'No tasks to interrupt!',
    });
  }

  public createInitButton() {
    return this.createButton({
      classNames: ['dt-init-button'],
      icon: 'refresh-cw',
      onClick: async () => {
        await this.plugin.initTimetableView();
        new Notice('Timetable initialized!', 1000);
      },
      noticeMessage: 'Initialization failed!',
    });
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
    const { showEstimate, showStartTime, showBufferTime } =
      this.plugin.settings;

    let currentTaskEndTime = new Date();
    let firstUncompletedTaskFound = false;

    const completedTasks = tasks.filter((task) => task.isChecked).reverse();
    const uncompletedTasks = tasks.filter((task) => !task.isChecked);

    const orderedTasks = [...completedTasks, ...uncompletedTasks];

    for (const task of orderedTasks) {
      const {
        task: parsedTaskName,
        estimate,
        startTime: taskStartTime,
        isChecked,
      } = task;
      const minutes =
        estimate !== null && estimate !== undefined ? parseInt(estimate) : null;
      let startTime: Date | null = null;

      if (!firstUncompletedTaskFound && !isChecked) {
        startTime = currentTaskEndTime;
        firstUncompletedTaskFound = true;
      } else if (taskStartTime) {
        startTime = new Date(taskStartTime);
      } else {
        startTime = currentTaskEndTime;
      }

      let endTime =
        minutes !== null && startTime
          ? new Date(
              startTime.getTime() +
                minutes * TableRenderer.MILLISECONDS_IN_MINUTE
            )
          : null;
      let bufferMinutes: number | null = null;

      if (!isChecked && taskStartTime) {
        bufferMinutes = Math.ceil(
          (new Date(taskStartTime).getTime() - currentTaskEndTime.getTime()) /
            TableRenderer.MILLISECONDS_IN_MINUTE
        );
        if (showBufferTime && startTime !== currentTaskEndTime) {
          const bufferRow = this.createBufferRow(bufferMinutes);
          tableBody.appendChild(bufferRow);
        }
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
      if (firstUncompletedTaskFound) {
        row.id = 'first-uncompleted-task';
      }
      tableBody.appendChild(row);

      currentTaskEndTime = endTime || currentTaskEndTime;
    }
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

    if (!this.plugin.settings.showCompletedTasks && isChecked) {
      taskRow.style.display = 'none';
    }

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
