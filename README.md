# Obsidian Dynamic Timetable

Dynamic Timetable is an Obsidian plugin that dynamically generates task timetables from Markdown files. This plugin was inspired by [タスクシュート(TaskChute)](https://cyblog.biz/pro/taskchute2/index2.php).

[![Image from Gyazo](https://i.gyazo.com/5e55167e5a828722a521d9ee55b12c73.gif)](https://gyazo.com/5e55167e5a828722a521d9ee55b12c73)

## Installation
Install with `L7Cy/obsidian-dynamic-timetable` using BRAT.

## Usage
The Dynamic Timetable plugin generates task lists and time estimates from markdown files. The plugin supports the following markdown formats for tasks (including subtasks).

```
- [ ] Task name ; Estimated time
- [ ] Task name ; Estimated time @ Start time
- [ ] Task name @ Start time ; Estimated time
```
Completed tasks and tasks without estimated time are excluded.

To display the task list, open the command palette (Ctrl/Cmd + P) and type "Show/Hide Timetable".

By default, the plugin uses the currently active file as the source of the task list. If you want to use a different file, you can specify the file path in the plugin settings.

### Start time format
The start time is optional and can be added in two formats:

- Time only (e.g., `@ 14:30`)
- Date and time (e.g., `@ 2023-04-16T14:30`)

### Task background color
When a start time is specified, tasks will have a background color based on the comparison with the end time of the previous task:

- Green: Indicates that the task is likely to start at the scheduled time, and there may be room to add more tasks before it.
- Red: Indicates that it may be difficult to start the task at the scheduled time, and adjustments to previous tasks may be necessary.

This visual cue helps us understand how to effectively adjust our tasks.

## Settings
You can customize the plugin by opening the plugin settings (in the settings sidebar, under "Community Plugins") and changing the following options.

### File path
The path to the Markdown file containing the task list (default: active file).
### Show estimate
Whether to show time estimates for each task.
### Task Estimate Delimiter
The character used to separate the task name and time estimate (default: ";").
### Start Time Delimiter
The character used to separate the task name and start time (default: "@").
### Header Names
The names of the columns in the task list table (default: tasks, estimate, end).

## License
This software is released under the [MIT License](https://opensource.org/license/mit/).
