import React from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceLeaf, ItemView } from "obsidian";
import DynamicTimetable from "./main";
import TimetableViewComponent, {
	TimetableViewComponentRef,
} from "./TimetableViewComponent";

export class TimetableView extends ItemView {
	private readonly plugin: DynamicTimetable;
	private componentRef: React.RefObject<TimetableViewComponentRef>;
	private root: any;

	constructor(leaf: WorkspaceLeaf, plugin: DynamicTimetable) {
		super(leaf);
		this.plugin = plugin;
		this.componentRef = React.createRef<TimetableViewComponentRef>();
	}

	getViewType(): string {
		return "Timetable";
	}

	getDisplayText(): string {
		return "Timetable";
	}

	async onOpen(): Promise<void> {
		this.root = createRoot(this.containerEl);
		this.root.render(
			<TimetableViewComponent
				plugin={this.plugin}
				ref={this.componentRef}
			/>
		);
	}

	async onClose(): Promise<void> {
		if (this.root) {
			this.root.unmount();
		}
	}

	async update() {
		if (this.componentRef.current) {
			this.componentRef.current.update();
		}
	}
}
