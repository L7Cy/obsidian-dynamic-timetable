import React, {
	useEffect,
	useRef,
	useState,
	forwardRef,
	useImperativeHandle,
} from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceLeaf, Notice, ItemView, setIcon } from "obsidian";
import DynamicTimetable from "./main";
import { taskFunctions } from "./TaskManager";

type Task = {
	task: string;
	startTime: Date | null;
	estimate: string | null;
	endTime: Date | null;
	isCompleted: boolean;
};

type ProgressBarProps = {
	duration: number;
	estimate: number;
	enableOverdueNotice: boolean;
};

type ButtonProps = {
	onClick: () => void;
	buttonRef: React.RefObject<HTMLButtonElement>;
	icon: string;
};

export interface TimetableViewComponentRef {
	update: () => Promise<void>;
}

const ButtonWithIcon = ({ onClick, buttonRef, icon }: ButtonProps) => {
	useEffect(() => {
		if (buttonRef.current) {
			setIcon(buttonRef.current, icon);
		}
	}, []);

	return <button ref={buttonRef} className="dt-button" onClick={onClick} />;
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
		const newTasks = await taskManager.initializeTasks();
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

export const ProgressBar = ({
	duration,
	estimate,
	enableOverdueNotice,
}: ProgressBarProps) => {
	const width = Math.min((duration / estimate) * 100, 100);
	const isOverdue = width === 100;

	if (isOverdue && enableOverdueNotice) {
		new Notice("Are you finished?", 0);
	}

	return (
		<div className="dt-progress-bar-container">
			<div
				className={`dt-progress-bar ${
					isOverdue ? "dt-progress-bar-overdue" : ""
				}`}
				style={{ width: width + "%" }}
			></div>
		</div>
	);
};

export class TimetableView extends ItemView {
	private readonly plugin: DynamicTimetable;
	private componentRef: React.RefObject<TimetableViewComponentRef>;
	private root: any;

	constructor(leaf: WorkspaceLeaf, plugin: DynamicTimetable) {
		super(leaf);
		this.plugin = plugin;
		this.componentRef = React.createRef<TimetableViewComponentRef>();
	}

	getViewType(): string {
		return "Timetable";
	}

	getDisplayText(): string {
		return "Timetable";
	}

	async onOpen(): Promise<void> {
		this.root = createRoot(this.containerEl);
		this.root.render(
			<TimetableViewComponent
				plugin={this.plugin}
				ref={this.componentRef}
			/>
		);
	}

	async onClose(): Promise<void> {
		if (this.root) {
			this.root.unmount();
		}
	}

	async update() {
		if (this.componentRef.current) {
			this.componentRef.current.update();
		}
	}
}
