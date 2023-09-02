import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceLeaf, ItemView } from 'obsidian';
import DynamicTimetable from './main';
import TimetableViewComponent from './TimetableViewComponent';
import { CommandsManager } from './Commands';

export class TimetableView extends ItemView {
  private readonly plugin: DynamicTimetable;
  private root: any;
  private commandsManager: CommandsManager;

  constructor(leaf: WorkspaceLeaf, plugin: DynamicTimetable) {
    super(leaf);
    this.plugin = plugin;
    this.commandsManager = new CommandsManager(plugin);
    this.icon = 'table';
  }

  getViewType(): string {
    return 'Timetable';
  }

  getDisplayText(): string {
    return 'Timetable';
  }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.containerEl);
    this.root.render(
      <TimetableViewComponent
        ref={this.plugin.timetableViewComponentRef}
        plugin={this.plugin}
        commandsManager={this.commandsManager}
      />
    );
  }

  async onClose(): Promise<void> {
    if (this.root) {
      this.root.unmount();
    }
  }

  async update() {
    if (this.plugin.timetableViewComponentRef.current) {
      this.plugin.timetableViewComponentRef.current.update();
    }
  }
}
