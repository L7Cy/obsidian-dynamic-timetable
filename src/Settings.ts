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
    this.createToggleSetting(
      'Show Categories in Task Name',
      'showCategoryNamesInTask'
    );
    this.createToggleSetting('Show Buffer Time Rows', 'showBufferTime');
    this.createToggleSetting('Show Completed Tasks', 'showCompletedTasks');
    this.createToggleSetting(
      'Show Remaining Time',
      'showRemainingTime',
      'Show remaining time instead of the time for current task in progress.'
    );
    this.createToggleSetting('Show Progress Bar', 'showProgressBar');
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
    const pathToDictionaryDesc = this.containerEl.createEl('p');
    pathToDictionaryDesc.style.marginBlockStart = '0em';
    pathToDictionaryDesc.style.marginBlockEnd = '0em';

    pathToDictionaryDesc.appendChild(
      createEl('span', {
        text: 'Enter the path to the custom dictionary file for ',
      })
    );
    pathToDictionaryDesc.appendChild(
      createEl('a', {
        text: 'Various Complements',
        href: 'obsidian://show-plugin?id=various-complements',
      })
    );
    pathToDictionaryDesc.appendText('.');
    this.createTextSetting(
      'Path to Dictionary for Suggestions',
      'pathToDictionary',
      pathToDictionaryDesc,
      'path/to/dictionary.md'
    );
    this.createTextAreaSetting(
      'Custom URL Scheme',
      'customUrlScheme',
      'Enter the URL scheme you want to execute when a task is completed. You can use the following placeholders: {{minutes}}, {{seconds}}, {{taskName}}',
      'your-app-scheme://doSomething?minutes={{minutes}}&seconds={{seconds}}&taskName={{taskName}}'
    );
    this.createToggleSetting(
      'Apply Background Color by Category (tag)',
      'applyBackgroundColorByCategory',
      'If enabled, applies background color based on the first category of each task.'
    );
    if (this.plugin.settings.applyBackgroundColorByCategory) {
      this.createCategoryColorsSetting();
    }
    this.createToggleSetting('Enable Overdue Notice', 'enableOverdueNotice');
  }

  createTextSetting(
    name: string,
    key: string,
    desc?: any,
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

  createTextAreaSetting(
    name: string,
    key: string,
    desc?: string,
    placeholder?: string
  ) {
    const setting = new Setting(this.containerEl).setName(name);
    if (desc) {
      setting.setDesc(desc);
    }
    setting.addTextArea((text) => {
      const el = text
        .setPlaceholder(placeholder || '')
        .setValue((this.plugin.settings[key] as string) || '');
      el.inputEl.style.height = '60px';
      el.inputEl.addEventListener('blur', async (event) => {
        const value = (event.target as HTMLTextAreaElement).value;
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

  createCategoryColorsSetting() {
    const categoryColorsSetting = new Setting(this.containerEl).setName(
      'Category Colors'
    );

    const categoryColorsContainer =
      categoryColorsSetting.settingEl.createEl('div');
    const categoryColors = this.plugin.settings.categoryColors || [];

    new Setting(categoryColorsContainer)
      .setName('Transparency')
      .addSlider((slider) => {
        slider
          .setLimits(0, 1, 0.1)
          .setValue(this.plugin.settings.categoryTransparency)
          .onChange(async (value) => {
            await this.plugin.updateSetting('categoryTransparency', value);
          });

        slider.sliderEl.style.width = 'auto';
      });

    categoryColors.forEach((item, index) => {
      new Setting(categoryColorsContainer)
        .setName(`Category ${index + 1}`)
        .addText((text) => {
          const el = text
            .setPlaceholder('Category')
            .setValue(item.category || '');

          el.inputEl.addEventListener('blur', async (event) => {
            const value = (event.target as HTMLInputElement).value;
            this.plugin.settings.categoryColors[index].category = value;
            await this.plugin.saveData(this.plugin.settings);
            await this.plugin.updateOpenViews('Timetable');
            await this.plugin.updateOpenViews('Statistics');
          });

          return el;
        })
        .addColorPicker((colorPicker) => {
          colorPicker.setValue(item.color).onChange(async (value) => {
            this.plugin.settings.categoryColors[index].color = value;
            await this.plugin.saveData(this.plugin.settings);
            await this.plugin.updateOpenViews('Timetable');
            await this.plugin.updateOpenViews('Statistics');
          });
        })
        .addButton((button) => {
          button.setButtonText('Delete').onClick(async () => {
            this.plugin.settings.categoryColors.splice(index, 1);
            await this.plugin.saveData(this.plugin.settings);
            this.display();
          });
        });
    });

    new Setting(categoryColorsContainer).addButton((button) => {
      button.setButtonText('Add Category Color').onClick(async () => {
        this.plugin.settings.categoryColors.push({
          category: '',
          color: '',
        });
        await this.plugin.saveData(this.plugin.settings);
        this.display();
      });
    });
  }
}
