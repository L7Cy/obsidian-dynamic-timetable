import React, { useEffect, useState } from "react";
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
	const [notice, setNotice] = useState<Notice | null>(null);
	const width = Math.min((duration / estimate) * 100, 100);
	const isOverdue = width === 100;

	useEffect(() => {
		if (isOverdue && enableOverdueNotice && !notice) {
			const newNotice = new Notice("Are you finished?", 0);
			setNotice(newNotice);
		} else if (!isOverdue && notice) {
			notice.hide();
			setNotice(null);
		}
	}, [isOverdue, enableOverdueNotice, notice]);

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
