import { App, PluginSettingTab, Setting } from 'obsidian';
import DynamicTimetable from './main';

export class DynamicTimetableSettingTab extends PluginSettingTab {
  plugin: DynamicTimetable;

  constructor(app: App, plugin: DynamicTimetable) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    this.createToggleSetting('Show Estimate Column', 'showEstimate');
    this.createToggleSetting('Show Start Time Column', 'showStartTime');
    this.createToggleSetting(
      'Show Estimate in Task Name',
      'showEstimateInTaskName'
    );
    this.createToggleSetting(
      'Show Start Time in Task Name',
      'showStartTimeInTaskName'
    );
    this.createToggleSetting('Show Buffer Time Rows', 'showBufferTime');
    this.createToggleSetting(
      'Show Completed Tasks',
      'showCompletedTasks',
      'If enabled, displays completed tasks in the timetable.'
    );
    this.createToggleSetting(
      'Show Progress Bar',
      'showProgressBar',
      'If enabled, displays a progress bar based on the top task estimate.'
    );
    if (this.plugin.settings.showProgressBar) {
      this.createTextSetting(
        'Interval Time (Seconds)',
        'intervalTime',
        'Set the interval for updating the progress bar.',
        '1'
      );
    }
    this.createTextSetting(
      'Task/Estimate Delimiter',
      'taskEstimateDelimiter',
      '',
      ';'
    );
    this.createTextSetting(
      'Start Time Delimiter',
      'startTimeDelimiter',
      '',
      '@'
    );
    this.createTextSetting(
      'Date Delimiter',
      'dateDelimiter',
      'Enter a regex that matches the delimiter for a new day.',
      '^---$'
    );
    const headerNames = Array.isArray(this.plugin.settings.headerNames)
      ? this.plugin.settings.headerNames.join(', ')
      : '';
    this.createHeaderNamesSetting(headerNames);
    this.createToggleSetting('Enable Overdue Notice', 'enableOverdueNotice');
  }

  createTextSetting(
    name: string,
    key: string,
    desc?: string,
    placeholder?: string
  ) {
    const setting = new Setting(this.containerEl).setName(name);
    if (desc) {
      setting.setDesc(desc);
    }
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

  createToggleSetting(name: string, key: string, desc?: string) {
    const setting = new Setting(this.containerEl).setName(name);
    if (desc) {
      setting.setDesc(desc);
    }
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
    new Setting(this.containerEl)
      .setName('Header Names')
      .setDesc('Enter header names, separated by commas.')
      .addText((text) => {
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
