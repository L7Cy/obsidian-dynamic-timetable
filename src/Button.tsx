import React, { useEffect, useRef } from "react";
import { setIcon } from "obsidian";

type ButtonProps = {
	onClick: () => void;
	buttonRef: React.RefObject<HTMLButtonElement>;
	icon: string;
};

const ButtonWithIcon = ({ onClick, buttonRef, icon }: ButtonProps) => {
	useEffect(() => {
		if (buttonRef.current) {
			setIcon(buttonRef.current, icon);
		}
	}, []);

	return <button ref={buttonRef} className="dt-button" onClick={onClick} />;
};

type ButtonContainerProps = {
	completeTask: () => void;
	interruptTask: () => void;
	initTimetableView: () => void;
};

export const ButtonContainer = ({
	completeTask,
	interruptTask,
	initTimetableView,
}: ButtonContainerProps) => {
	const completeButtonRef = useRef(null);
	const interruptButtonRef = useRef(null);
	const initButtonRef = useRef(null);

	return (
		<div className="dt-button-container">
			<ButtonWithIcon
				buttonRef={completeButtonRef}
				onClick={completeTask}
				icon="check-circle"
			/>
			<ButtonWithIcon
				buttonRef={interruptButtonRef}
				onClick={interruptTask}
				icon="circle-slash"
			/>
			<ButtonWithIcon
				buttonRef={initButtonRef}
				onClick={initTimetableView}
				icon="refresh-ccw"
			/>
		</div>
	);
};

export default ButtonWithIcon;
