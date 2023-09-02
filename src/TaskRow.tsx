import React from 'react';
import { Task } from './TaskManager';
import DynamicTimetable from './main';

type TaskRowProps = {
  task: Task;
  plugin: DynamicTimetable;
  bufferTime: number | null;
  firstUncompletedTaskRef: React.MutableRefObject<HTMLTableRowElement | null> | null;
  categoryBackgroundColors: Record<string, string>;
  allTasksCompleted: boolean;
  duration: number;
  estimate: number;
};

const formatDateToTime = (date: Date) => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const formatToHHMMSS = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${remainingSeconds}`;
};

const createCategoryClasses = (categories: string[]): string => {
  return categories.map((category) => `dt-category-${category}`).join(' ');
};

const TaskRow: React.FC<TaskRowProps> = ({
  task,
  plugin,
  bufferTime,
  firstUncompletedTaskRef,
  categoryBackgroundColors,
  allTasksCompleted,
  duration,
  estimate,
}) => {
  let bufferClass = '';
  if (
    (task.originalStartTime &&
      bufferTime !== null &&
      0 <= bufferTime &&
      !task.isCompleted) ||
    (0 <= estimate - duration && firstUncompletedTaskRef)
  ) {
    bufferClass = 'on-time';
  } else if (
    (bufferTime !== null && bufferTime < 0 && !task.isCompleted) ||
    (estimate - duration < 0 && firstUncompletedTaskRef)
  ) {
    bufferClass = 'late';
  }

  const remainingTimeSeconds = Math.floor((estimate - duration) / 1000);
  const categoryClasses = createCategoryClasses(task.categories);
  const originalBackgroundColor =
    categoryBackgroundColors[task.categories[0]] || '';
  const backgroundColor =
    task.isCompleted && !allTasksCompleted
      ? originalBackgroundColor.replace(/,\s*([^,]+)\)/, ', 0.05)')
      : originalBackgroundColor;

  const style = plugin.settings.applyBackgroundColorByCategory
    ? {
        backgroundColor: backgroundColor,
      }
    : {};

  return (
    <tr
      ref={task.isCompleted ? null : firstUncompletedTaskRef}
      className={`dt-task-row ${bufferClass} ${
        !allTasksCompleted && task.isCompleted ? 'dt-completed' : ''
      } ${categoryClasses}`}
      style={style}>
      <td>{task.task}</td>
      {plugin.settings.showEstimate &&
        !(plugin.settings.showRemainingTime && firstUncompletedTaskRef) && (
          <td style={{ textAlign: 'center' }}>{task.estimate}</td>
        )}
      {plugin.settings.showStartTime &&
        !(plugin.settings.showRemainingTime && firstUncompletedTaskRef) && (
          <td style={{ textAlign: 'center' }}>
            {task.startTime ? formatDateToTime(task.startTime) : ''}
          </td>
        )}
      {!(plugin.settings.showRemainingTime && firstUncompletedTaskRef) && (
        <td style={{ textAlign: 'center' }}>
          {task.endTime ? formatDateToTime(task.endTime) : ''}
        </td>
      )}
      {plugin.settings.showRemainingTime && firstUncompletedTaskRef && (
        <td colSpan={3} style={{ textAlign: 'center' }}>
          {formatToHHMMSS(Math.abs(remainingTimeSeconds))}
        </td>
      )}
    </tr>
  );
};

export default TaskRow;
