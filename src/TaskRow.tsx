import React from 'react';
import { Task } from './TaskManager';
import DynamicTimetable from './main';

type TaskRowProps = {
  task: Task;
  plugin: DynamicTimetable;
  bufferTime: number | null;
  firstUncompletedTaskRef: React.MutableRefObject<HTMLTableRowElement | null> | null;
};

const formatDateToTime = (date: Date) => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const TaskRow: React.FC<TaskRowProps> = ({
  task,
  plugin,
  bufferTime,
  firstUncompletedTaskRef,
}) => {
  let bufferClass = '';
  if (bufferTime && bufferTime !== null && !task.isCompleted) {
    bufferClass = bufferTime < 0 ? 'late' : 'on-time';
  }

  return (
    <tr
      ref={task.isCompleted ? null : firstUncompletedTaskRef}
      className={`${bufferClass} ${task.isCompleted ? 'dt-completed' : ''}`}>
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
