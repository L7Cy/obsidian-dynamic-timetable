# Obsidian Dynamic Timetable

Dynamic Timetable is an Obsidian plugin that dynamically generates task timetables from Markdown files. This plugin was inspired by [TaskChute](https://cyblog.biz/pro/taskchute2/index2.php).

[![Image from Gyazo](https://i.gyazo.com/5e55167e5a828722a521d9ee55b12c73.gif)](https://gyazo.com/5e55167e5a828722a521d9ee55b12c73)

## Installation
Install with `L7Cy/obsidian-dynamic-timetable` using BRAT.

## Usage
The Dynamic Timetable plugin generates task lists and time estimates from markdown files. The plugin supports the following markdown formats for tasks (including subtasks).

```
- [ ] Task name: Estimated time
```
Completed tasks and tasks with no estimated time are excluded.

To display the task list, open the command palette (Ctrl/Cmd + P) and type "Show/Hide Timetable".

By default, the plugin will use the currently active file as the source of the task list. If you want to use a different file, you can set the file path in the plugin settings.

## Settings
You can customize the plugin by opening the plugin settings (in the settings sidebar, under "Community Plugins") and changing the following options.

### File Path
The path to the Markdown file that contains the task list (default: active file).
### Show Estimate
Whether to display time estimates for each task.
### Task Estimate Delimiter
The character used to separate the task name and time estimate (default: ":").
### Header Names
The names of the columns in the task list table (default: tasks, estimate, end).

## License
This software is released under the [MIT License](https://opensource.org/license/mit/).
