# Obsidian Dynamic Timetable

Dynamic Timetable is an [Obsidian](https://obsidian.md/) plugin that dynamically generates task timetables from Markdown files. This plugin was inspired by [タスクシュート(TaskChute)](https://cyblog.biz/pro/taskchute2/index2.php).

[![Image from Gyazo](https://i.gyazo.com/6f1eb253ff398b6cafb3ac8835925753.png)](https://gyazo.com/6f1eb253ff398b6cafb3ac8835925753)

## Installation

The plugin is now officially released as a community plugin. You can install it from below.

```
obsidian://show-plugin?id=dynamic-timetable
```

If you want to try the beta version, install it with `L7Cy/obsidian-dynamic-timetable` using [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## Usage

### Task description format

The plugin supports the following markdown formats for tasks.

```
- [ ] Task name ; Estimated time
- [ ] Task name ; Estimated time @ Start time
- [ ] Task name @ Start time ; Estimated time
```

### Start time format

The start time is optional and can be added in two formats:

- Time only (e.g., `@ 14:30`)
- Date and time (e.g., `@ 2023-04-16T14:30`)

### Task completion and interruption

To complete or interrupt a task, execute the commands "Complete Task" or "Interrupt Task." Upon execution, the topmost incomplete task is checked, and the estimated time and scheduled start time are overwritten with the actual time taken and actual start time.

[![Image from Gyazo](https://i.gyazo.com/687f9193d6f01d1eb4f1e05b7ccda84b.gif)](https://gyazo.com/687f9193d6f01d1eb4f1e05b7ccda84b)

In the case of "Interrupt Task," in addition to this, a new task with the same name is created and the remaining time is set to the estimated time.

[![Image from Gyazo](https://i.gyazo.com/526d2f3eaa20b533dffc2093a6758d9b.gif)](https://gyazo.com/526d2f3eaa20b533dffc2093a6758d9b)

### Task text color

When a start time is specified, tasks will have a text color based on the comparison with the end time of the previous task:

- 🟢Green: Indicates that the task is likely to start at the scheduled time, and there may be room to add more tasks before it.
- 🔴Red: Indicates that it may be difficult to start the task at the scheduled time, and adjustments to previous tasks may be necessary.

This visual cue helps us understand how to effectively adjust our tasks.
