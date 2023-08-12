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
import { MarkdownView } from 'obsidian';

export type TimetableViewComponentRef = {
  update: () => Promise<void>;
  scrollToFirstUncompletedTask: () => void;
};

const getRandomLightColor = (alpha: number = 0.3) => {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 80;
  const lightness = 80;
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
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

  const [categoryBackgroundColors, setCategoryBackgroundColors] = useState<
    Record<string, string>
  >({});

  const update = async () => {
    const newTasks = await taskManager.initializeTasks();
    setTasks(newTasks);
  };

  const filteredTasks = plugin.settings.showCompletedTasks
    ? tasks
    : tasks.filter((task) => !task.isCompleted);

  const performScroll = () => {
    if (firstUncompletedTaskRef.current && containerRef.current) {
      const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView?.file === plugin.targetFile) {
        return;
      }
      const containerHeight = containerRef.current.offsetHeight;
      const taskOffsetTop = firstUncompletedTaskRef.current.offsetTop;
      const scrollToPosition = taskOffsetTop - containerHeight / 5;

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
  }, [plugin, plugin.targetFile]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const topUncompletedTask = tasks.find((task) => !task.isCompleted);
      if (
        topUncompletedTask &&
        topUncompletedTask.startTime &&
        topUncompletedTask.estimate
      ) {
        let duration =
          new Date().getTime() - topUncompletedTask.startTime.getTime();
        const estimate = parseInt(topUncompletedTask.estimate) * 60 * 1000;
        if (duration < 0) {
          duration += 24 * 60 * 60;
        }
        setProgressDuration(duration);
        setProgressEstimate(estimate);
      }
    }, plugin.settings.intervalTime * 1000);

    return () => clearInterval(intervalId);
  }, [containerRef.current, tasks]);

  useEffect(() => {
    performScroll();
  }, [tasks]);

  useEffect(() => {
    const newBackgroundColors = { ...categoryBackgroundColors };

    tasks.forEach((task) => {
      task.categories.forEach((category) => {
        if (!newBackgroundColors[category]) {
          const className = `dt-category-${category}`;
          const color = getRandomLightColor();
          newBackgroundColors[category] = color;
          document.documentElement.style.setProperty(
            `--${className}-bg`,
            color
          );
        }
      });
    });

    setCategoryBackgroundColors(newBackgroundColors);
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
              task !== firstUncompletedTask &&
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
                categoryBackgroundColors={categoryBackgroundColors}
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
