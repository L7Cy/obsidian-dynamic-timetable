import React from "react";
import { Notice } from "obsidian";

type ProgressBarProps = {
	duration: number;
	estimate: number;
	enableOverdueNotice: boolean;
};

const ProgressBar = ({
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

export default ProgressBar;
