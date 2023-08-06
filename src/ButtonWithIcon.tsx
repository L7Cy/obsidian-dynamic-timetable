import React, { useEffect } from "react";
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

export default ButtonWithIcon;
