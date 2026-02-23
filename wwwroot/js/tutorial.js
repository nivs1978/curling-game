export function createTutorialController(config) {
	let step = 0;
	let demoStart = null;
	let demoTime = 0;
	let cameraTargetY = null;

	const startTutorial = () => {
		config.setCurrentMode(config.GameMode.TUTORIAL);
		config.setMinimapHidden(true);
		step = 0;
		demoStart = null;
		demoTime = 0;
		cameraTargetY = null;
		config.hideMenu();
		config.resetStonesToHomeTrays();
		config.setScoreboardVisible(false);
		config.stopThinkingTimer();
		config.uiController.setTimerHidden(true);
		config.setCameraToHackView(config.nearHackCenter);
		config.resizeCanvas();
	};

	const advanceTutorial = () => {
		step += 1;
		if (step === 1) {
			config.setCameraToHackView(config.nearHackCenter);
			cameraTargetY = null;
		}
		if (step === 2) {
			config.clearCameraFollowStone();
			config.camera.y = config.launchStartY;
			config.clampCameraPosition({ allowBeyondBottom: true });
			demoStart = performance.now();
			cameraTargetY = null;
		}
		if (step === 3) {
			cameraTargetY = config.getCameraYForStoneFromTop(
				config.hogLineNearY,
				3 * config.feetToMeters
			);
			demoStart = performance.now();
		}
		config.resizeCanvas();
		if (step >= 4) {
			step = 0;
			demoStart = null;
			demoTime = 0;
			cameraTargetY = null;
			config.showMenu();
		}
	};

	const update = (timestamp) => {
		demoTime = timestamp;
		if (
			config.getCurrentMode() === config.GameMode.TUTORIAL &&
			cameraTargetY != null
		) {
			const delta = cameraTargetY - config.camera.y;
			config.camera.y += delta * 0.08;
			config.clampCameraPosition({ allowBeyondBottom: true });
			if (Math.abs(delta) < 0.02) {
				cameraTargetY = null;
			}
		}
	};

	const getState = () => ({
		step,
		demoStart,
		demoTime
	});

	return {
		startTutorial,
		advanceTutorial,
		update,
		getState
	};
}
