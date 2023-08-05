import React, {
	useEffect,
	useRef,
	useState,
	forwardRef,
	useImperativeHandle,
} from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceLeaf, Notice, ItemView } from "obsidian";
import DynamicTimetable from "./main";
import { TaskParser } from "./TaskParser";
import { ProgressBarManager } from "./ProgressBarManager";

type Task = {
	task: string;
	startTime: Date | null;
	estimate: string | null;
	endTime: Date | null;
	isCompleted: boolean;
};

export interface TimetableViewComponentRef {
	update: () => Promise<void>;
}

const TimetableViewComponent = forwardRef<
	TimetableViewComponentRef,
	{ plugin: DynamicTimetable }
>(({ plugin }, ref) => {
	const [tasks, setTasks] = useState<Task[]>([]);
	const taskParser = TaskParser.fromSettings(plugin.settings);
	const containerRef = useRef<HTMLDivElement | null>(null);

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
			const bufferMinutes = Math.ceil(
				(taskStartTime.getTime() - currentTaskEndTime.getTime()) /
					(60 * 1000)
			);
			return bufferMinutes;
		}
		return null;
	};

	const update = async () => {
		if (!plugin.targetFile) return;
		const content = await plugin.app.vault.cachedRead(plugin.targetFile);
		const parsedTasks = taskParser.filterAndParseTasks(content);
		setTasks(parsedTasks);
	};

	const filteredTasks = plugin.settings.showCompletedTasks
		? tasks
		: tasks.filter((task) => !task.isCompleted);

	useImperativeHandle(ref, () => ({
		update,
	}));

	useEffect(() => {
		const onFileModify = async (file: any) => {
			if (file === plugin.targetFile) {
				await update();
				new Notice("Timetable updated!");
			}
		};
		const unregisterEvent = plugin.app.vault.on("modify", onFileModify);
		plugin.registerEvent(unregisterEvent);

		update();

		return () => plugin.app.vault.off("modify", onFileModify);
	}, [plugin]);

	useEffect(() => {
		if (containerRef.current && tasks.length > 0) {
			const progressBarManager = new ProgressBarManager(
				plugin,
				containerRef.current
			);

			const intervalId = setInterval(() => {
				const topUncompletedTask = tasks.find(
					(task) => !task.isCompleted
				);
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
					progressBarManager.createOrUpdateProgressBar(
						duration,
						estimate
					);
				}
			}, plugin.settings.intervalTime * 1000);

			return () => clearInterval(intervalId);
		}
	}, [containerRef.current, tasks]);

	return (
		<div
			ref={containerRef}
			className="Timetable dt-content"
			style={{ overflow: "auto", maxHeight: "100%" }}
		>
			{plugin.settings.showProgressBar && (
				<div
					className={
						ProgressBarManager.PROGRESS_BAR_CLASS +
						"-container dt-progress-bar-container"
					}
				></div>
			)}
			<div className="dt-button-container">
				<button
					className="dt-button"
					onClick={() => plugin.initTimetableView()}
				>
					Init
				</button>
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
