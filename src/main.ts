import { Plugin, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { TimetableView } from "./TimetableView";
import { DynamicTimetableSettingTab } from "./Settings";

export interface Task {
	task: string;
	startTime: Date | null;
	estimate: string | null;
	endTime: Date | null;
	isCompleted: boolean;
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

	async initTimetableView() {
		const leaves = this.app.workspace.getLeavesOfType("Timetable");
		if (leaves.length == 0) {
			this.openTimetable();
		} else {
			for (let leaf of leaves) {
				let view = leaf.view;
				if (view instanceof TimetableView) {
					this.checkTargetFile();
					await view.update();
				}
			}
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
		const abstractFile = this.settings.filePath
			? this.app.vault.getAbstractFileByPath(this.settings.filePath)
			: this.app.workspace.getActiveFile();

		if (abstractFile instanceof TFile) {
			this.targetFile = abstractFile;
		} else {
			this.targetFile = null;
			new Notice("No active file or active file is not a Markdown file");
		}
	}
}
