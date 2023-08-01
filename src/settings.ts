import {
  App, PluginSettingTab,
  Setting
} from 'obsidian';
import DynamicTimetable from './main';

export class DynamicTimetableSettingTab extends PluginSettingTab {
  plugin: DynamicTimetable;

  constructor(app: App, plugin: DynamicTimetable) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

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
      'Show Completed Tasks',
      'If enabled, displays completed tasks in the timetable.',
      'showCompletedTasks',
      'toggle'
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
    this.createSetting(
      'Date Delimiter',
      'Enter a regex that matches the delimiter for a new day.',
      'dateDelimiter',
      'text',
      '^---$'
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
      'Enable Overdue Notice',
      '',
      'enableOverdueNotice',
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
    setting.addToggle((toggle) => toggle
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
