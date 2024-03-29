import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceLeaf, ItemView } from 'obsidian';
import DynamicTimetable from './main';
import { StatisticsViewComponent } from './StatisticsViewComponent';

type CategoryPerformanceViewRef = {
  update: () => void;
};

export class StatisticsView extends ItemView {
  private root: any;
  private componentRef: React.RefObject<CategoryPerformanceViewRef>;
  private plugin: DynamicTimetable;

  constructor(leaf: WorkspaceLeaf, plugin: DynamicTimetable) {
    super(leaf);
    this.plugin = plugin;
    this.componentRef = React.createRef();
    this.icon = "bar-chart-horizontal";
  }

  getViewType(): string {
    return 'Statistics';
  }

  getDisplayText(): string {
    return 'Timetable Stats';
  }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.containerEl);
    this.root.render(
      <StatisticsViewComponent
        plugin={this.plugin}
        ref={this.componentRef}
        tasks={this.plugin.tasks}
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
