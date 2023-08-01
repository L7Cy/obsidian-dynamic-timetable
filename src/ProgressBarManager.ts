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
