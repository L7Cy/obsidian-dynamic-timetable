import React, { useEffect, useRef } from "react";
import { setIcon } from "obsidian";
import { CommandsManager } from "./Commands";
import DynamicTimetable from "./main";

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
	plugin: DynamicTimetable;
	commandsManager: CommandsManager;
};

export const ButtonContainer = ({
	plugin,
	commandsManager,
}: ButtonContainerProps) => {
	const completeButtonRef = useRef(null);
	const interruptButtonRef = useRef(null);
	const initButtonRef = useRef(null);

	return (
		<div className="dt-button-container">
			<ButtonWithIcon
				buttonRef={completeButtonRef}
				onClick={() => commandsManager.completeTask()}
				icon="check-circle"
			/>
			<ButtonWithIcon
				buttonRef={interruptButtonRef}
				onClick={() => commandsManager.interruptTask()}
				icon="circle-slash"
			/>
			<ButtonWithIcon
				buttonRef={initButtonRef}
				onClick={() => plugin.initTimetableView()}
				icon="refresh-ccw"
			/>
		</div>
	);
};

export default ButtonWithIcon;
