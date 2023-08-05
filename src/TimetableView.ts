import { WorkspaceLeaf, ItemView, Notice } from "obsidian";
import DynamicTimetable, { Task } from "./main";
import { TaskParser } from "./TaskParser";

export class TimetableView extends ItemView {
	private taskParser: TaskParser;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: DynamicTimetable,
	) {
		super(leaf);
		this.containerEl.addClass("Timetable");
		this.taskParser = TaskParser.fromSettings(this.plugin.settings);

		plugin.registerEvent(
			this.app.vault.on("modify", async (file) => {
				if (file === this.plugin.targetFile) {
					this.update();
				}
			}),
		);
	}

	getViewType(): string {
		return "Timetable";
	}

	getDisplayText(): string {
		return "Timetable";
	}

	async onOpen(): Promise<void> {
		await this.update();
	}

	async onClose(): Promise<void> {
		// Do nothing
	}

	async update() {
		if (!this.plugin.targetFile) {
			return;
		}
		const content = await this.app.vault.cachedRead(this.plugin.targetFile);
		const tasks = this.parseTasksFromContent(content);
		await this.renderTable(tasks);
	}

	parseTasksFromContent(content: string): Task[] {
		const tasks = this.taskParser.filterAndParseTasks(content);
		return tasks;
	}

	async renderTable(tasks: Task[]): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		const scheduleTable = this.createTable();
		const tableHead = scheduleTable.createTHead();
		const tableBody = scheduleTable.createTBody();

		tableHead.appendChild(this.createTableHeader());
		this.appendTableBodyRows(tableBody, tasks);

		const updateButton = this.createUpdateButton();
		contentEl.appendChild(updateButton);
		contentEl.appendChild(scheduleTable);
	}

	private createTable(): HTMLTableElement {
		return this.contentEl.createEl("table");
	}

	private createTableHeader(): HTMLTableRowElement {
		const { headerNames, showEstimate, showStartTime } =
			this.plugin.settings;
		const [
			taskHeaderName,
			estimateHeaderName,
			startTimeHeaderName,
			endHeaderName,
		] = headerNames;

		const tableHeaderValues = [taskHeaderName];
		if (showEstimate) {
			tableHeaderValues.push(estimateHeaderName);
		}
		if (showStartTime) {
			tableHeaderValues.push(startTimeHeaderName);
		}
		tableHeaderValues.push(endHeaderName);
		return this.createTableRow(tableHeaderValues, true);
	}

	private appendTableBodyRows(
		tableBody: HTMLTableSectionElement,
		tasks: Task[],
	): void {
		const { showEstimate, showStartTime } = this.plugin.settings;
		const MILLISECONDS_IN_MINUTE = 60000;

		let currentTime = new Date();
		let previousEndTime: Date | null = null;

		for (let task of tasks) {
			const { task: parsedTaskName, startTime, estimate } = task;
			const minutes = estimate ? parseInt(estimate) : null;
			if (startTime) {
				currentTime = new Date(startTime);
			} else if (previousEndTime) {
				currentTime = previousEndTime;
			}

			const endTime = minutes
				? new Date(
						currentTime.getTime() +
							minutes * MILLISECONDS_IN_MINUTE,
				  )
				: null;

			let backgroundColor: string | null = null;
			if (startTime) {
				if (previousEndTime && new Date(startTime) < previousEndTime) {
					backgroundColor = "rgba(255, 0, 0, 0.3)";
				} else {
					backgroundColor = "rgba(0, 255, 0, 0.3)";
				}
			}

			const tableRowValues = [parsedTaskName];
			if (showEstimate && estimate) {
				tableRowValues.push(`${estimate}m`);
			}
			if (showStartTime) {
				tableRowValues.push(this.formatTime(currentTime));
			}
			if (endTime) {
				tableRowValues.push(this.formatTime(endTime));
			}
			tableBody.appendChild(
				this.createTableRow(tableRowValues, false, backgroundColor),
			);

			if (endTime) {
				previousEndTime = endTime;
				currentTime = endTime;
			}
		}
	}

	private createTableRow(
		rowValues: string[],
		isHeader = false,
		backgroundColor: string | null = null,
	): HTMLTableRowElement {
		const row = document.createElement("tr");
		if (backgroundColor) {
			row.setAttribute("style", `background-color: ${backgroundColor};`);
		}
		rowValues.forEach((value) => {
			const cell = document.createElement(isHeader ? "th" : "td");
			cell.textContent = value;
			row.appendChild(cell);
		});
		return row;
	}

	private formatTime(date: Date): string {
		return new Intl.DateTimeFormat(navigator.language, {
			hour: "numeric",
			minute: "numeric",
		}).format(date);
	}

	private createUpdateButton(): HTMLButtonElement {
		const updateButton = this.contentEl.createEl("button", {
			text: "Update",
		});
		updateButton.addEventListener("click", async () => {
			await this.update();
			new Notice("Timetable updated!");
		});
		return updateButton;
	}
}
