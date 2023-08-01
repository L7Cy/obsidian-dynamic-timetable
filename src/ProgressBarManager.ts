import { Notice } from 'obsidian';
import DynamicTimetable from './main';

export class ProgressBarManager {
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
    const progressBarContainer = this.getOrCreateElement(
      this.contentEl,
      ProgressBarManager.PROGRESS_BAR_CLASS + '-container'
    );

    const progressBar = this.getOrCreateElement(
      progressBarContainer,
      ProgressBarManager.PROGRESS_BAR_CLASS
    );

    const width = Math.min((duration / estimate) * 100, 100);
    this.updateProgressBarStyle(progressBar, width);
  }

  private getOrCreateElement(
    parent: HTMLElement,
    className: string
  ): HTMLElement {
    let element = parent.querySelector('.' + className) as HTMLElement;
    if (!element) {
      element = parent.createEl('div');
      element.addClass(className);
    }
    return element;
  }

  private updateProgressBarStyle(
    progressBar: HTMLElement,
    width: number
  ): void {
    progressBar.style.width = width + '%';
    if (width === 100) {
      this.markProgressBarAsOverdue(progressBar);
    } else {
      this.markProgressBarAsNotOverdue(progressBar);
    }
  }

  private markProgressBarAsOverdue(progressBar: HTMLElement): void {
    progressBar.addClass(ProgressBarManager.PROGRESS_BAR_OVERDUE_CLASS);
    this.createNotice();
  }

  private markProgressBarAsNotOverdue(progressBar: HTMLElement): void {
    progressBar.removeClass(ProgressBarManager.PROGRESS_BAR_OVERDUE_CLASS);
    if (this.overdueNotice) {
      this.overdueNotice.hide();
      this.overdueNotice = null;
    }
  }

  private createNotice(): void {
    if (!this.overdueNotice && this.plugin.settings.enableOverdueNotice) {
      this.overdueNotice = new Notice('Are you finished?', 0);
    }
  }
}
