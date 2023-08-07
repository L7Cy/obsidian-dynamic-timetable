import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import DynamicTimetable from './main';
import { Task, taskFunctions } from './TaskManager';
import { ButtonContainer } from './Button';
import ProgressBar from './ProgressBar';
import { CommandsManager } from './Commands';
import BufferTimeRow from './BufferTimeRow';
import TaskRow from './TaskRow';

export type TimetableViewComponentRef = {
  update: () => Promise<void>;
  scrollToFirstUncompletedTask: () => void;
};

const TimetableViewComponent = forwardRef<
  TimetableViewComponentRef,
  {
    plugin: DynamicTimetable;
    commandsManager: CommandsManager;
  }
>(({ plugin, commandsManager }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstUncompletedTaskRef = useRef<HTMLTableRowElement | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progressDuration, setProgressDuration] = useState(0);
  const [progressEstimate, setProgressEstimate] = useState(0);
  const taskManager = taskFunctions(plugin);
  const firstUncompletedTask = tasks.find((task) => !task.isCompleted);

  const calculateBufferTime = (
    currentTaskEndTime: Date | null,
    taskStartTime: Date | null
  ): number | null => {
    if (currentTaskEndTime && taskStartTime) {
      return Math.ceil(
        (taskStartTime.getTime() - currentTaskEndTime.getTime()) / (60 * 1000)
      );
    }
    return null;
  };

  const update = async () => {
    if (!plugin.targetFile) return;
    const content = await plugin.app.vault.cachedRead(plugin.targetFile);
    const newTasks = await taskManager.initializeTasks();

    const yamlStartTime = taskManager.getYamlStartTime(content);
    if (yamlStartTime) {
      const topUncompletedTask = newTasks.find((task) => !task.isCompleted);
      if (topUncompletedTask) {
        topUncompletedTask.startTime = yamlStartTime;
      }
    }

    setTasks(newTasks);
  };

  const filteredTasks = plugin.settings.showCompletedTasks
    ? tasks
    : tasks.filter((task) => !task.isCompleted);

  const performScroll = () => {
    if (firstUncompletedTaskRef.current && containerRef.current) {
      const containerHeight = containerRef.current.offsetHeight;
      const taskOffsetTop = firstUncompletedTaskRef.current.offsetTop;
      const scrollToPosition = taskOffsetTop - containerHeight / 4;

      containerRef.current.scrollTo({
        top: scrollToPosition,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    const onFileModify = async (file: any) => {
      if (file === plugin.targetFile) {
        await update();
      }
    };
    const unregisterEvent = plugin.app.vault.on('modify', onFileModify);
    plugin.registerEvent(unregisterEvent);
    update();
    return () => plugin.app.vault.off('modify', onFileModify);
  }, [plugin]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const topUncompletedTask = tasks.find((task) => !task.isCompleted);
      if (
        topUncompletedTask &&
        topUncompletedTask.startTime &&
        topUncompletedTask.estimate
      ) {
        const duration =
          new Date().getTime() - topUncompletedTask.startTime.getTime();
        const estimate = parseInt(topUncompletedTask.estimate) * 60 * 1000;
        setProgressDuration(duration);
        setProgressEstimate(estimate);
      }
    }, plugin.settings.intervalTime * 1000);

    return () => clearInterval(intervalId);
  }, [containerRef.current, tasks]);

  useEffect(() => {
    performScroll();
  }, [tasks]);

  useImperativeHandle(ref, () => ({
    update,
    scrollToFirstUncompletedTask: performScroll,
  }));

  return (
    <div
      ref={containerRef}
      className="Timetable dt-content"
      style={{ overflow: 'auto', maxHeight: '100%' }}>
      {plugin.settings.showProgressBar && (
        <ProgressBar
          duration={progressDuration}
          estimate={progressEstimate}
          enableOverdueNotice={plugin.settings.enableOverdueNotice}
        />
      )}
      <ButtonContainer commandsManager={commandsManager} />
      <table className="dt-table">
        <thead>
          <tr>
            <th>{plugin.settings.headerNames[0]}</th>
            {plugin.settings.showEstimate && (
              <th>{plugin.settings.headerNames[1]}</th>
            )}
            {plugin.settings.showStartTime && (
              <th>{plugin.settings.headerNames[2]}</th>
            )}
            <th>{plugin.settings.headerNames[3]}</th>
          </tr>
        </thead>
        <tbody>
          {filteredTasks.flatMap((task, index, allTasks) => {
            const previousTask = allTasks[index - 1];
            const bufferTime = calculateBufferTime(
              previousTask?.endTime || new Date(),
              task.startTime
            );

            const rows = [];

            if (
              bufferTime &&
              plugin.settings.showBufferTime &&
              !task.isCompleted
            ) {
              rows.push(
                <BufferTimeRow
                  key={`buffer-${index}`}
                  bufferTime={bufferTime}
                />
              );
            }

            rows.push(
              <TaskRow
                key={`task-${index}`}
                task={task}
                plugin={plugin}
                bufferTime={bufferTime}
                firstUncompletedTaskRef={
                  task === firstUncompletedTask ? firstUncompletedTaskRef : null
                }
              />
            );

            return rows;
          })}
        </tbody>
      </table>
    </div>
  );
});

export default TimetableViewComponent;
