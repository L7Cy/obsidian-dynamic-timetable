import { App, PluginSettingTab, Setting } from "obsidian";
import { TimetableView } from "./TimetableView";
import DynamicTimetable, { DynamicTimetableSettings } from "./main";

export class DynamicTimetableSettingTab extends PluginSettingTab {
	plugin: DynamicTimetable;

	constructor(app: App, plugin: DynamicTimetable) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.containerEl.empty();

		this.createFilePathSetting();
		this.createShowEstimateSetting();
		this.createShowStartTimeSetting();
		this.createShowEstimateInTaskNameSetting();
		this.createShowStartTimeInTaskNameSetting();
		this.createTaskEstimateDelimiterSetting();
		this.createStartTimeDelimiterSetting();

		const defaultHeaderNames =
			DynamicTimetable.DEFAULT_SETTINGS.headerNames;
		defaultHeaderNames.forEach((defaultHeaderName, index) => {
			const headerName =
				this.plugin.settings.headerNames[index] || defaultHeaderName;
			this.createHeaderNameSetting(headerName, index);
		});
	}

	private createFilePathSetting(): Setting {
		const filePathSetting = new Setting(this.containerEl)
			.setName("File Path")
			.setDesc(
				"Enter the path to the Markdown file to get task list from. Leave blank to use active file."
			)
			.addText((text) => {
				const el = text
					.setPlaceholder("/path/to/target/file.md")
					.setValue(this.plugin.settings.filePath || "");
				el.inputEl.addEventListener(
					"change",
					this.onFilePathChange.bind(this)
				);
				return el;
			});

		return filePathSetting;
	}

	private createShowEstimateSetting(): Setting {
		const showEstimateSetting = new Setting(this.containerEl)
			.setName("Show Estimate Column")
			.setDesc("Show/hide the estimate column")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showEstimate)
					.onChange(async (value) => {
						await this.updateSetting("showEstimate", value);
					})
			);

		return showEstimateSetting;
	}

	private createShowStartTimeSetting(): Setting {
		const showStartTimeSetting = new Setting(this.containerEl)
			.setName("Show Start Time Column")
			.setDesc("Show/hide the start time column")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStartTime)
					.onChange(async (value) => {
						await this.updateSetting("showStartTime", value);
					})
			);

		return showStartTimeSetting;
	}

	private createShowEstimateInTaskNameSetting(): Setting {
		const showEstimateInTaskNameSetting = new Setting(this.containerEl)
			.setName("Show estimate in task name")
			.setDesc(
				"Include estimate time with the delimiter in the task name"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showEstimateInTaskName)
					.onChange(async (value) => {
						this.plugin.settings.showEstimateInTaskName = value;
						await this.updateSetting(
							"showEstimateInTaskName",
							value
						);
					})
			);

		return showEstimateInTaskNameSetting;
	}

	private createShowStartTimeInTaskNameSetting(): Setting {
		const showStartInTaskNameSetting = new Setting(this.containerEl)
			.setName("Show start time in task name")
			.setDesc("Include start time with the delimiter in the task name")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStartTimeInTaskName)
					.onChange(async (value) => {
						this.plugin.settings.showStartTimeInTaskName = value;
						await this.updateSetting("showStartInTaskName", value);
					})
			);

		return showStartInTaskNameSetting;
	}

	private createTaskEstimateDelimiterSetting(): Setting {
		const taskEstimateDelimiterSetting = new Setting(this.containerEl)
			.setName("Task/Estimate Delimiter")
			.setDesc(
				"Enter the delimiter to use between the task name and estimate"
			)
			.addText((text) => {
				const el = text
					.setPlaceholder(";")
					.setValue(this.plugin.settings.taskEstimateDelimiter);
				el.inputEl.addEventListener("change", async (ev) => {
					if (!(ev.target instanceof HTMLInputElement)) {
						return;
					}
					const value = ev.target.value.trim();
					await this.updateSetting("taskEstimateDelimiter", value);
				});
				return el;
			});

		return taskEstimateDelimiterSetting;
	}

	private createStartTimeDelimiterSetting(): Setting {
		const startTimeDelimiterSetting = new Setting(this.containerEl)
			.setName("Start Time Delimiter")
			.setDesc(
				"Enter the delimiter to use between the task name and start time"
			)
			.addText((text) => {
				const el = text
					.setPlaceholder("@")
					.setValue(this.plugin.settings.startTimeDelimiter);
				el.inputEl.addEventListener("change", async (ev) => {
					if (!(ev.target instanceof HTMLInputElement)) {
						return;
					}
					const value = ev.target.value.trim();
					await this.updateSetting("startTimeDelimiter", value);
				});
				return el;
			});

		return startTimeDelimiterSetting;
	}

	private createHeaderNameSetting(
		headerName: string,
		index: number
	): Setting {
		const headerNameSetting = new Setting(this.containerEl)
			.setName(`Header Name ${index + 1}`)
			.setDesc(`Enter the name of header ${index + 1}`)
			.addText((text) =>
				text.setValue(headerName).onChange(async (value) => {
					const headerNames = [...this.plugin.settings.headerNames];
					headerNames[index] = value;
					await this.updateSetting("headerNames", headerNames);
				})
			);

		return headerNameSetting;
	}

	private async onFilePathChange(ev: Event): Promise<void> {
		if (!(ev.target instanceof HTMLInputElement)) {
			return;
		}
		const value = ev.target.value.trim();
		return this.updateSetting("filePath", value);
	}

	private async updateSetting<T extends keyof DynamicTimetableSettings>(
		settingName: T,
		newValue: DynamicTimetableSettings[T]
	): Promise<void> {
		this.plugin.settings[settingName] = newValue;
		await this.plugin.saveData(this.plugin.settings);

		for (let leaf of this.plugin.app.workspace.getLeavesOfType(
			"Timetable"
		)) {
			let view = leaf.view;
			if (view instanceof TimetableView) {
				await view.update();
			}
		}
	}
}
