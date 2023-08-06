import { Plugin, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { TimetableView } from "./TimetableView";
import { DynamicTimetableSettingTab } from "./Settings";

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

declare module "obsidian" {
	interface Workspace {
		on(eventName: "layout-ready", callback: () => any, ctx?: any): EventRef;
	}
}

export default class DynamicTimetable extends Plugin {
	settings: DynamicTimetableSettings;
	targetFile: TFile | null = null;

	static DEFAULT_SETTINGS: DynamicTimetableSettings = {
		filePath: null,
		showEstimate: false,
		showStartTime: false,
		showEstimateInTaskName: false,
		showStartTimeInTaskName: true,
		showBufferTime: true,
		showProgressBar: true,
		intervalTime: 1,
		taskEstimateDelimiter: ";",
		startTimeDelimiter: "@",
		dateDelimiter: "",
		enableOverdueNotice: true,
		headerNames: ["Tasks", "Estimate", "Start", "End"],
		showCompletedTasks: true,
	};

	onunload(): void {
		this.closeTimetable();
	}

	async onload() {
		console.log("DynamicTimetable: onload");

		this.settings = {
			...DynamicTimetable.DEFAULT_SETTINGS,
			...(await this.loadData()),
		};
		this.addSettingTab(new DynamicTimetableSettingTab(this.app, this));

		this.addToggleTimetableCommand();
		this.registerView(
			"Timetable",
			(leaf: WorkspaceLeaf) => new TimetableView(leaf, this)
		);

		if (this.app.workspace.layoutReady) {
			this.initTimetableView();
		} else {
			this.registerEvent(
				this.app.workspace.on(
					"layout-ready",
					this.initTimetableView.bind(this)
				)
			);
		}
	}

	async updateSetting<T extends keyof DynamicTimetableSettings>(
		settingName: T,
		newValue: DynamicTimetableSettings[T]
	): Promise<void> {
		this.settings[settingName] = newValue;
		await this.saveData(this.settings);
		await this.updateOpenTimetableViews();
	}

	async initTimetableView() {
		if (!this.isTimetableOpen()) {
			this.openTimetable();
		} else {
			this.updateOpenTimetableViews();
		}
	}

	private addToggleTimetableCommand(): void {
		this.addCommand({
			id: "toggle-timetable",
			name: "Show/Hide Timetable",
			callback: () => {
				const leaves = this.app.workspace.getLeavesOfType("Timetable");
				if (leaves.length == 0) {
					this.openTimetable();
				} else {
					this.closeTimetable();
				}
			},
		});
	}

	async updateOpenTimetableViews() {
		for (const leaf of this.app.workspace.getLeavesOfType("Timetable")) {
			const view = leaf.view;
			if (view instanceof TimetableView) {
				this.checkTargetFile();
				await view.update();
			}
		}
	}

	isTimetableOpen(): boolean {
		return this.app.workspace.getLeavesOfType("Timetable").length > 0;
	}

	async openTimetable() {
		this.checkTargetFile();
		const leaf = this.app.workspace.getRightLeaf(false);
		leaf.setViewState({ type: "Timetable" });
		this.app.workspace.revealLeaf(leaf);
	}

	closeTimetable() {
		this.app.workspace.detachLeavesOfType("Timetable");
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
			new Notice("No active file or active file is not a Markdown file");
		}
	}

	async updateFilePathSetting(newPath: string): Promise<void> {
		this.settings.filePath = newPath;
		await this.saveData(this.settings);
	}
}
