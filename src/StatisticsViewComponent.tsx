import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { Task, TaskParser } from './TaskParser';
import DynamicTimetable from './main';
import { taskFunctions } from './TaskManager';
import { Bar } from 'react-chartjs-2';

import {
  Chart,
  BarController,
  LinearScale,
  CategoryScale,
  BarElement,
  Tooltip,
} from 'chart.js';

Chart.register(BarController, LinearScale, CategoryScale, BarElement, Tooltip);

type Props = {
  plugin: DynamicTimetable;
  tasks: Task[];
};

export const StatisticsViewComponent = forwardRef((props: Props, ref) => {
  const { plugin, tasks: initialTasks } = props;
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const taskManager = taskFunctions(plugin);
  const categoryBackgroundColors = plugin.categoryBackgroundColors;

  const performance = new TaskParser(
    plugin.settings.taskEstimateDelimiter,
    plugin.settings.startTimeDelimiter,
    plugin.settings.dateDelimiter,
    plugin.settings.showStartTimeInTaskName,
    plugin.settings.showEstimateInTaskName,
    plugin.settings.showCategoryNamesInTask
  ).getCategoryPerformance(tasks);

  const performanceArray = Object.entries(performance).map(
    ([category, { actualTime, estimatedTime }]) => ({
      category,
      actualTime,
      estimatedTime,
      total: actualTime + estimatedTime,
    })
  );

  performanceArray.sort((a, b) => b.total - a.total);

  const actualBackgroundColors = performanceArray.map((p) => {
    const color = categoryBackgroundColors[p.category];
    return color.replace(/,\s*([^,]+)\)/, ', 1)');
  });
  const estimatedBackgroundColors = performanceArray.map((p) => {
    const color = categoryBackgroundColors[p.category];
    return color.replace(/,\s*([^,]+)\)/, ', 0.3)');
  });

  const actualTimes = performanceArray.map((p) => p.actualTime);
  const estimatedTimes = performanceArray.map((p) => p.estimatedTime);

  const data = {
    labels: performanceArray.map((p) => p.category),
    datasets: [
      {
        label: 'Actual Time',
        data: actualTimes,
        backgroundColor: actualBackgroundColors,
        stack: 'combined',
      },
      {
        label: 'Estimated Time',
        data: estimatedTimes,
        backgroundColor: estimatedBackgroundColors,
        stack: 'combined',
      },
    ],
  };

  const options = {
    indexAxis: 'y' as const,
    scales: {
      y: {
        beginAtZero: true,
      },
      x: {
        beginAtZero: true,
      },
    },
  };

  const update = async () => {
    const newTasks = await taskManager.initializeTasks();
    setTasks(newTasks);
  };

  useEffect(() => {
    const onFileModify = async (file: any) => {
      if (file === plugin.targetFile) {
        await update();
      }
    };
    const unregisterEvent = plugin.app.vault.on('modify', onFileModify);
    plugin.registerEvent(unregisterEvent);
    return () => plugin.app.vault.off('modify', onFileModify);
  }, [plugin, plugin.targetFile]);

  useImperativeHandle(ref, () => ({
    update,
  }));

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Bar data={data} options={options} />
    </div>
  );
});
