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
};

const formatDateToTime = (date: Date) => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
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
}) => {
  let bufferClass = '';
  if (
    task.originalStartTime &&
    bufferTime !== null &&
    bufferTime >= 0 &&
    !task.isCompleted
  ) {
    bufferClass = 'on-time';
  } else if (bufferTime !== null && bufferTime < 0 && !task.isCompleted) {
    bufferClass = 'late';
  }

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
      className={`${bufferClass} ${
        !allTasksCompleted && task.isCompleted ? 'dt-completed' : ''
      } ${categoryClasses}`}
      style={style}>
      <td>{task.task}</td>
      {plugin.settings.showEstimate && (
        <td style={{ textAlign: 'center' }}>{task.estimate}</td>
      )}
      {plugin.settings.showStartTime && (
        <td style={{ textAlign: 'center' }}>
          {task.startTime ? formatDateToTime(task.startTime) : ''}
        </td>
      )}
      <td style={{ textAlign: 'center' }}>
        {task.endTime ? formatDateToTime(task.endTime) : ''}
      </td>
    </tr>
  );
};

export default TaskRow;
