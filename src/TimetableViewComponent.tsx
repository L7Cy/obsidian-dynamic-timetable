import React, {
	useEffect,
	useRef,
	useState,
	forwardRef,
	useImperativeHandle,
} from "react";
import DynamicTimetable from "./main";
import { taskFunctions } from "./TaskManager";
import ButtonWithIcon from "./ButtonWithIcon";
import ProgressBar from "./ProgressBar";

type Task = {
	task: string;
	startTime: Date | null;
	estimate: string | null;
	endTime: Date | null;
	isCompleted: boolean;
};

export type TimetableViewComponentRef = {
	update: () => Promise<void>;
};

const TimetableViewComponent = forwardRef<
	TimetableViewComponentRef,
	{ plugin: DynamicTimetable }
>(({ plugin }, ref) => {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [progressDuration, setProgressDuration] = useState(0);
	const [progressEstimate, setProgressEstimate] = useState(0);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const completeButtonRef = useRef(null);
	const interruptButtonRef = useRef(null);
	const initButtonRef = useRef(null);
	const taskManager = taskFunctions(plugin);

	const formatDateToTime = (date: Date) => {
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		return `${hours}:${minutes}`;
	};

	const calculateBufferTime = (
		currentTaskEndTime: Date | null,
		taskStartTime: Date | null
	): number | null => {
		if (currentTaskEndTime && taskStartTime) {
			return Math.ceil(
				(taskStartTime.getTime() - currentTaskEndTime.getTime()) /
					(60 * 1000)
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
			const topUncompletedTask = newTasks.find(
				(task) => !task.isCompleted
			);
			if (topUncompletedTask) {
				topUncompletedTask.startTime = yamlStartTime;
			}
		}

		setTasks(newTasks);
	};

	const filteredTasks = plugin.settings.showCompletedTasks
		? tasks
		: tasks.filter((task) => !task.isCompleted);

	useImperativeHandle(ref, () => ({ update }));

	useEffect(() => {
		const onFileModify = async (file: any) => {
			if (file === plugin.targetFile) {
				await update();
			}
		};
		const unregisterEvent = plugin.app.vault.on("modify", onFileModify);
		plugin.registerEvent(unregisterEvent);
		update();
		return () => plugin.app.vault.off("modify", onFileModify);
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
					new Date().getTime() -
					topUncompletedTask.startTime.getTime();
				const estimate =
					parseInt(topUncompletedTask.estimate) * 60 * 1000;
				setProgressDuration(duration);
				setProgressEstimate(estimate);
			}
		}, plugin.settings.intervalTime * 1000);

		return () => clearInterval(intervalId);
	}, [containerRef.current, tasks]);

	return (
		<div
			ref={containerRef}
			className="Timetable dt-content"
			style={{ overflow: "auto", maxHeight: "100%" }}
		>
			{plugin.settings.showProgressBar && (
				<ProgressBar
					duration={progressDuration}
					estimate={progressEstimate}
					enableOverdueNotice={plugin.settings.enableOverdueNotice}
				/>
			)}
			<div className="dt-button-container">
				<ButtonWithIcon
					buttonRef={completeButtonRef}
					onClick={() => {
						const firstUncompletedTask = tasks.find(
							(task) => !task.isCompleted
						);
						if (firstUncompletedTask) {
							taskManager.completeTask(firstUncompletedTask);
						}
					}}
					icon="check-circle"
				/>
				<ButtonWithIcon
					buttonRef={interruptButtonRef}
					onClick={() => {
						const firstUncompletedTask = tasks.find(
							(task) => !task.isCompleted
						);
						if (firstUncompletedTask) {
							taskManager.interruptTask(firstUncompletedTask);
						}
					}}
					icon="circle-slash"
				/>
				<ButtonWithIcon
					buttonRef={initButtonRef}
					onClick={() => plugin.initTimetableView()}
					icon="refresh-ccw"
				/>
			</div>
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
						const bufferTime =
							previousTask &&
							calculateBufferTime(
								previousTask.endTime || new Date(),
								task.startTime
							);

						let bufferClass = "";
						if (bufferTime && !task.isCompleted) {
							bufferClass = bufferTime < 0 ? "late" : "on-time";
						}

						const rows: JSX.Element[] = [];

						if (
							bufferTime &&
							plugin.settings.showBufferTime &&
							!task.isCompleted
						) {
							rows.push(
								<tr
									key={`buffer-${index}`}
									className="buffer-time dt-buffer-time"
								>
									<td>Buffer Time</td>
									<td colSpan={3}>{bufferTime}m</td>
								</tr>
							);
						}

						rows.push(
							<tr
								key={`task-${index}`}
								className={`${bufferClass} ${
									task.isCompleted ? "dt-completed" : ""
								}`}
							>
								<td>{task.task}</td>
								{plugin.settings.showEstimate && (
									<td>{task.estimate}</td>
								)}
								{plugin.settings.showStartTime && (
									<td>
										{task.startTime
											? formatDateToTime(task.startTime)
											: ""}
									</td>
								)}
								<td>
									{task.endTime
										? formatDateToTime(task.endTime)
										: ""}
								</td>
							</tr>
						);

						return rows;
					})}
				</tbody>
			</table>
		</div>
	);
});

export default TimetableViewComponent;
