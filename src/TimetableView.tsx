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
			className="Timetable"
			style={{ overflow: "auto", maxHeight: "100%" }}
		>
			{plugin.settings.showProgressBar && (
				<div
					className={
						ProgressBarManager.PROGRESS_BAR_CLASS + "-container"
					}
				></div>
			)}
			<button onClick={update}>Update</button>
			<table>
				<thead>
					<tr>
						<th>Task</th>
						{plugin.settings.showEstimate && <th>Estimate</th>}
						{plugin.settings.showStartTime && <th>Start</th>}
						<th>End</th>
					</tr>
				</thead>
				<tbody>
					{filteredTasks.map((task, index) => (
						<tr key={index}>
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
					))}
				</tbody>
			</table>
		</div>
	);
});

const formatDateToTime = (date: Date) => {
	const hours = date.getHours().toString().padStart(2, "0");
	const minutes = date.getMinutes().toString().padStart(2, "0");
	return `${hours}:${minutes}`;
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
