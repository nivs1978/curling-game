/*
* Curling Game - A curling simulation game
* Copyright (C) 2025 Barosaurus Software
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
import { PhysicsEngine } from './physics.js';
import { StoneColor } from './stone.js';
import { createInputController } from './input.js';
import { createGameplayController } from './gameplay.js';
import { createAudioManager } from './audio.js';
import { createUIController } from './ui.js';
import { createTutorialController } from './tutorial.js';
import {
	BACK_LINE_Y,
	CAMERA_CENTER_X,
	FAR_TRAY_BASE_Y,
	FEET_TO_METERS,
	GameMode,
	HOG_LINE_FAR_Y,
	HOG_LINE_NEAR_Y,
	HOG_SPONSOR_MARGIN_X,
	HOG_SPONSOR_OFFSET_Y,
	HOG_SPONSOR_PIXEL_HEIGHT,
	HOG_SPONSOR_SCALE,
	HOG_SPONSOR_WIDTH,
	LAUNCH_START_Y,
	LINE_MARKINGS,
	MAX_PULLBACK_METERS,
	MAX_ROTATION_RATE,
	MAX_THROW_SPEED,
	MEASUREMENTS,
	MINIMAP_MARGIN_PX,
	MINIMAP_SCALE_FRACTION,
	MINIMAP_Y_MAX,
	MINIMAP_Y_MIN,
	MIN_THROW_SPEED,
	NEAR_HACK_CENTER,
	NEAR_HACK_TOP,
	RED_FAR_TRAY_BASE_X,
	ROTATION_SWIPE_REFERENCE_DISTANCE,
	ROTATION_SWIPE_REFERENCE_TIME,
	SCORE_CAMERA_LERP,
	SCORE_CAMERA_SETTLE_MS,
	SCORE_CAMERA_TARGET_Y,
	SCORE_MESSAGE_DURATION_MS,
	SCORE_POST_MESSAGE_DELAY_MS,
	SCORE_REMOVE_INTERVAL_MS,
	SHEET_EXTENTS,
	SIDE_BUFFER_METERS,
	STONE_RADIUS,
	STONE_SCREEN_FRACTION_FROM_BOTTOM,
	STONE_TRAY_COLUMN_SPACING,
	STONE_TRAY_COLUMNS,
	STONE_TRAY_ROW_SPACING,
	STONE_TRAY_ROWS,
	STONE_TRAY_SIDE_MARGIN,
	STONE_TRAY_BOTTOM_MARGIN,
	SWEEP_CURL_BOOST,
	SWEEP_DIRECTION_RATIO,
	SWEEP_FRICTION_REDUCTION,
	SWEEP_MIN_DISTANCE_PX,
	TEAM_THINK_TIME_SECONDS,
	YELLOW_FAR_TRAY_BASE_X,
	EXTRA_END_THINK_TIME_SECONDS
} from './constants.js';
import {
	camera,
	clampCameraPosition,
	clearCameraFollowStone,
	configureCamera,
	getCameraFollowStone,
	getCameraYForLaunch,
	getCameraYForStoneFromTop,
	getDisplayScale,
	setCameraToEndLineTop,
	setCameraToHackView,
	setCameraToLaunchPosition,
	setCameraZoom,
	setScaleData,
	updateCameraFollow,
	centerCameraHorizontal
} from './camera.js';
import {
	configureGraphics,
	drawTrack,
	isPointInMinimap
} from './graphics.js';

const canvas = document.getElementById('curling-canvas');
const ctx = canvas?.getContext('2d');

const BASE_ENDS = 10;
const scoreboardState = {
	teams: [
		{
			stoneColor: StoneColor.RED,
			name: 'Red',
			displayColor: '#c62828',
			scores: Array(BASE_ENDS).fill(''),
			total: 0
		},
		{
			stoneColor: StoneColor.YELLOW,
			name: 'Yellow',
			displayColor: '#fdd835',
			scores: Array(BASE_ENDS).fill(''),
			total: 0
		}
	],
	activeTeamColor: StoneColor.RED
};

let currentEndIndex = 0;
let startingTeamColor = StoneColor.RED;
let isEndInProgress = false;
let endResultCommitted = false;
let isGameOver = false;
let scoringSequence = null;
let minimapHidden = false;
let pendingRoundAction = null;
let menuVisible = false;
let currentMode = GameMode.MENU;
let timerRunningColor = null;
let timerLastTimestamp = null;
let timerDisplayColor = StoneColor.RED;
const teamThinkTimeRemaining = {
	[StoneColor.RED]: TEAM_THINK_TIME_SECONDS,
	[StoneColor.YELLOW]: TEAM_THINK_TIME_SECONDS
};
let nextTeamColorPending = null;
let readyStoneKey = null;
let currentThrowIndex = 0;
let lastLaunchedStoneKey = null;
let nextReadyAllowedAt = 0;

const HOUSE_RADIUS = MEASUREMENTS.rings.redOuter;

function buildTrayLookup(configs) {
	const map = new Map();
	configs.forEach((config) => {
		map.set(config.number, { ...config.position });
	});
	return map;
}

const trayBaseY = SHEET_EXTENTS.yMin + STONE_TRAY_BOTTOM_MARGIN;
const redTrayBaseX = SHEET_EXTENTS.xMin + STONE_TRAY_SIDE_MARGIN;
const yellowTrayBaseX = SHEET_EXTENTS.xMax - STONE_TRAY_SIDE_MARGIN;

const redStoneConfigs = createTeamStoneConfigs({
	color: StoneColor.RED,
	baseX: redTrayBaseX,
	baseY: trayBaseY,
	direction: 1
});

const yellowStoneConfigs = createTeamStoneConfigs({
	color: StoneColor.YELLOW,
	baseX: yellowTrayBaseX,
	baseY: trayBaseY,
	direction: -1
});

const STONES_PER_TEAM = Math.max(redStoneConfigs.length, yellowStoneConfigs.length);

const trayPositionLookup = {
	[StoneColor.RED]: buildTrayLookup(redStoneConfigs),
	[StoneColor.YELLOW]: buildTrayLookup(yellowStoneConfigs)
};

function loadStaticImage(src) {
	const img = new Image();
	img.src = src;
	return img;
}

const hogLineRightImage = loadStaticImage('img/golden_brush_stick_cup.png');
const hogLineLeftImage = loadStaticImage('img/ice_sports_center.png');
const hogLineFarRightImage = loadStaticImage('img/curl_up_and_dye.png');
const hogLineFarLeftImage = loadStaticImage('img/stones_realestate.png');
const hogLineMidRightImage = loadStaticImage('img/center_delivery.png');
const hogLineMidLeftImage = loadStaticImage('img/sweep_and_clean.png');

const audioManager = createAudioManager({
	getStoneKey,
	getLastLaunchedStoneKey: () => lastLaunchedStoneKey
});

const physicsEngine = new PhysicsEngine({
	launchY: LAUNCH_START_Y,
	stoneRadius: STONE_RADIUS,
	hogLineNear: HOG_LINE_NEAR_Y,
	hogLineFar: HOG_LINE_FAR_Y,
	sheetExtents: SHEET_EXTENTS,
	backLineY: BACK_LINE_Y,
	onStoneStopped: handleStoneStopped,
	onHogNearCross: handleHogNearCross,
	onStoneCollision: audioManager.handleStoneCollision,
	onStoneOut: audioManager.handleStoneOut
});

physicsEngine.initializeStones([...redStoneConfigs, ...yellowStoneConfigs]);

const redOutTraySlots = createOutTraySlots({
	baseX: RED_FAR_TRAY_BASE_X,
	baseY: FAR_TRAY_BASE_Y,
	horizontalDirection: -1
});

const yellowOutTraySlots = createOutTraySlots({
	baseX: YELLOW_FAR_TRAY_BASE_X,
	baseY: FAR_TRAY_BASE_Y,
	horizontalDirection: 1
});

physicsEngine.setOutTrayLayouts({
	[StoneColor.RED]: redOutTraySlots,
	[StoneColor.YELLOW]: yellowOutTraySlots
});

let wakeLockSentinel = null;
function startTwoPlayerGame() {
	currentMode = GameMode.TWO_PLAYER;
	minimapHidden = false;
	hideMenu();
	gameplayController.resetGameState();
	gameplayController.startNewEnd(StoneColor.RED);
}

function startPracticeGame() {
	currentMode = GameMode.PRACTICE;
	minimapHidden = false;
	hideMenu();
	gameplayController.resetGameState();
	setScoreboardVisible(false);
	gameplayController.startNewEnd(StoneColor.RED);
}

function startTutorial() {
	tutorialController.startTutorial();
}

function setActiveTeamColor(color) {
	scoreboardState.activeTeamColor = color;
	renderScoreboard();
	if (timerRunningColor == null) {
		timerDisplayColor = color;
		updateTimerLabel();
	}
}

function resetStonesToHomeTrays() {
	const stones = physicsEngine.getStones();
	for (const stone of stones) {
		if (currentMode === GameMode.PRACTICE && stone.color === StoneColor.YELLOW) {
			relocateStoneToOutTray(stone);
			continue;
		}
		const lookup = trayPositionLookup[stone.color];
		const template = lookup?.get(stone.number);
		if (template) {
			stone.position = { ...template };
		}
		stone.velocity = { vx: 0, vy: 0 };
		stone.pendingRotationRate = 0;
		stone.rotationRate = 0;
		stone.rotationActivated = true;
		stone.angle = 0;
		stone.isLaunched = false;
		stone.isOut = false;
		stone.hasStoppedNotified = true;
	}
	physicsEngine.resetOutTrayIndices?.();
	clearCameraFollowStone();
}

function relocateStoneToOutTray(stone) {
	if (!stone) {
		return;
	}
	stone.velocity = { vx: 0, vy: 0 };
	stone.pendingRotationRate = 0;
	stone.rotationRate = 0;
	stone.rotationActivated = true;
	stone.angle = 0;
	stone.isLaunched = false;
	stone.isOut = true;
	stone.hasStoppedNotified = true;
	physicsEngine.placeStoneInOutTray?.(stone);
}

let hasInitializedCameraView = false;
configureCamera({
	canvas,
	sheetExtents: SHEET_EXTENTS,
	sideBufferMeters: SIDE_BUFFER_METERS,
	cameraCenterX: CAMERA_CENTER_X,
	stoneScreenFractionFromBottom: STONE_SCREEN_FRACTION_FROM_BOTTOM,
	maxPullbackMeters: MAX_PULLBACK_METERS,
	launchMarginMeters: MAX_PULLBACK_METERS + FEET_TO_METERS,
	topClampY: 0,
	minZoom: 0.5
});
configureGraphics({ canvasElement: canvas, context: ctx });
const uiController = createUIController({
	canvas,
	getDisplayScale,
	measurements: MEASUREMENTS,
	scoreboardState
});
const tutorialController = createTutorialController({
	GameMode,
	getCurrentMode: () => currentMode,
	setCurrentMode: (mode) => {
		currentMode = mode;
	},
	setMinimapHidden: (value) => {
		minimapHidden = value;
	},
	hideMenu,
	showMenu,
	resetStonesToHomeTrays,
	setScoreboardVisible,
	stopThinkingTimer,
	uiController,
	setCameraToHackView,
	resizeCanvas,
	clearCameraFollowStone,
	clampCameraPosition,
	getCameraYForStoneFromTop,
	camera,
	launchStartY: LAUNCH_START_Y,
	hogLineNearY: HOG_LINE_NEAR_Y,
	feetToMeters: FEET_TO_METERS,
	nearHackCenter: NEAR_HACK_CENTER
});

function renderScoreboard() {
	uiController.renderScoreboard({
		scheduledEnds: gameplayController.getTotalScheduledEnds(),
		currentEndIndex,
		isGameOver
	});
}

function updateScoreboardLayout() {
	uiController.updateScoreboardLayout();
}

function setScoreboardVisible(visible) {
	uiController.setScoreboardVisible(visible);
}

function formatTimer(seconds) {
	const safeSeconds = Math.max(0, Math.ceil(seconds));
	const minutes = Math.floor(safeSeconds / 60);
	const remainingSeconds = safeSeconds % 60;
	return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function updateTimerLabel() {
	const displayColor = timerDisplayColor ?? scoreboardState.activeTeamColor;
	uiController.setTimerText(formatTimer(teamThinkTimeRemaining[displayColor]));
}

function startThinkingTimer(color) {
	if (timerRunningColor === color) {
		return;
	}
	timerRunningColor = color;
	timerDisplayColor = color;
	timerLastTimestamp = performance.now();
	updateTimerLabel();
}

function stopThinkingTimer() {
	timerRunningColor = null;
	timerLastTimestamp = null;
	updateTimerLabel();
}

function updateThinkingTimer(timestamp) {
	if (!timerRunningColor || timerLastTimestamp == null) {
		return;
	}
	const deltaSeconds = (timestamp - timerLastTimestamp) / 1000;
	timerLastTimestamp = timestamp;
	const remaining = teamThinkTimeRemaining[timerRunningColor] - deltaSeconds;
	teamThinkTimeRemaining[timerRunningColor] = Math.max(0, remaining);
	updateTimerLabel();
	if (!isGameOver && teamThinkTimeRemaining[timerRunningColor] <= 0) {
		const losingColor = timerRunningColor;
		const winningColor = getOppositeColor(losingColor);
		const winningTeam = scoreboardState.teams.find(
			(team) => team.stoneColor === winningColor
		);
		stopThinkingTimer();
		gameplayController.concludeGame(winningTeam);
	}
}

function mountScoreboard() {
	uiController.mountScoreboard();
	renderScoreboard();
	setScoreboardVisible(false);
}

function mountTimer() {
	uiController.mountTimer();
	updateTimerLabel();
}

function mountWinnerAnnouncement() {
	uiController.mountWinnerAnnouncement();
}

function mountEndScoreAnnouncement() {
	uiController.mountEndScoreAnnouncement();
}

function showWinnerAnnouncement(message) {
	uiController.showWinnerAnnouncement(message);
}

function hideWinnerAnnouncement() {
	uiController.hideWinnerAnnouncement();
}

function showEndScoreAnnouncement(message) {
	uiController.showEndScoreAnnouncement(message);
}

function hideEndScoreAnnouncement() {
	uiController.hideEndScoreAnnouncement();
}

function mountMenu() {
	uiController.mountMenu({
		items: [
			{ label: 'Practice', onClick: startPracticeGame },
			{ label: 'Two player', onClick: startTwoPlayerGame },
			{ label: 'Play against AI' },
			{ label: 'Play agaisnt friend' },
			{ label: 'Tutorial', onClick: startTutorial },
			{ label: 'Rules', onClick: () => window.open('https://worldcurling.org/rules/', '_blank', 'noopener') }
		]
	});
	showMenu();
}

function showMenu() {
	menuVisible = true;
	currentMode = GameMode.MENU;
	minimapHidden = true;
	uiController.setMenuVisible(true);
	uiController.setTimerHidden(true);
	inputController.resetInteractions();
	pendingRoundAction = null;
	endResultCommitted = false;
	isEndInProgress = false;
	stopThinkingTimer();
	setScoreboardVisible(false);
	hideEndScoreAnnouncement();
	hideWinnerAnnouncement();
}

function hideMenu() {
	menuVisible = false;
	uiController.setMenuVisible(false);
	uiController.setTimerHidden(false);
}
const inputController = createInputController({
	canvas,
	camera,
	gameMode: GameMode,
	getCurrentMode: () => currentMode,
	advanceTutorial: () => tutorialController.advanceTutorial(),
	isMenuVisible: () => menuVisible,
	getPendingRoundAction: () => pendingRoundAction,
	onPendingRoundAction: () => gameplayController.handlePendingRoundAction(),
	getMinimapHidden: () => minimapHidden,
	setMinimapHidden: (value) => {
		minimapHidden = value;
	},
	isPointInMinimap,
	setCameraToLaunchPosition: () => setCameraToLaunchPosition(LAUNCH_START_Y),
	setCameraToEndLineTop: () => setCameraToEndLineTop(BACK_LINE_Y, HOG_LINE_FAR_Y),
	getReadyStoneKey: () => readyStoneKey,
	setReadyStoneKey: (value) => {
		readyStoneKey = value;
	},
	getCurrentThrowIndex: () => currentThrowIndex,
	setCurrentThrowIndex: (value) => {
		currentThrowIndex = value;
	},
	setNextTeamColorPending: (value) => {
		nextTeamColorPending = value;
	},
	getColorForThrowIndex,
	getStoneByKey,
	getStoneKey,
	isStoneAvailable,
	resetStoneForLaunch,
	getThrowSpeed,
	launchStartY: LAUNCH_START_Y,
	hogLineNearY: HOG_LINE_NEAR_Y,
	stoneRadius: STONE_RADIUS,
	maxPullbackMeters: MAX_PULLBACK_METERS,
	rotationSwipeReferenceDistance: ROTATION_SWIPE_REFERENCE_DISTANCE,
	rotationSwipeReferenceTime: ROTATION_SWIPE_REFERENCE_TIME,
	maxRotationRate: MAX_ROTATION_RATE,
	sweepFrictionReduction: SWEEP_FRICTION_REDUCTION,
	sweepCurlBoost: SWEEP_CURL_BOOST,
	sweepMinDistancePx: SWEEP_MIN_DISTANCE_PX,
	sweepDirectionRatio: SWEEP_DIRECTION_RATIO,
	isEndInProgress: () => isEndInProgress,
	isGameOver: () => isGameOver,
	isScoringSequenceActive: () => !!scoringSequence,
	isPhysicsRunning: () => physicsEngine.isRunning(),
	physicsEngine,
	renderScoreboard,
	launchSound: audioManager.launchSound,
	getLastLaunchedStoneKey: () => lastLaunchedStoneKey,
	setLastLaunchedStoneKey: (value) => {
		lastLaunchedStoneKey = value;
	}
});
const gameplayController = createGameplayController({
	physicsEngine,
	inputController,
	StoneColor,
	GameMode,
	getCurrentMode: () => currentMode,
	getCurrentEndIndex: () => currentEndIndex,
	setCurrentEndIndex: (value) => {
		currentEndIndex = value;
	},
	getStartingTeamColor: () => startingTeamColor,
	setStartingTeamColor: (value) => {
		startingTeamColor = value;
	},
	getIsEndInProgress: () => isEndInProgress,
	setIsEndInProgress: (value) => {
		isEndInProgress = value;
	},
	getEndResultCommitted: () => endResultCommitted,
	setEndResultCommitted: (value) => {
		endResultCommitted = value;
	},
	getIsGameOver: () => isGameOver,
	setIsGameOver: (value) => {
		isGameOver = value;
	},
	getScoringSequence: () => scoringSequence,
	setScoringSequence: (value) => {
		scoringSequence = value;
	},
	getPendingRoundAction: () => pendingRoundAction,
	setPendingRoundAction: (value) => {
		pendingRoundAction = value;
	},
	setReadyStoneKey: (value) => {
		readyStoneKey = value;
	},
	setCurrentThrowIndex: (value) => {
		currentThrowIndex = value;
	},
	setNextTeamColorPending: (value) => {
		nextTeamColorPending = value;
	},
	setActiveTeamColor,
	showMenu,
	setScoreboardVisible,
	renderScoreboard,
	resetStonesToHomeTrays,
	ensureReadyStone,
	relocateStoneToOutTray,
	stopThinkingTimer,
	showEndScoreAnnouncement,
	hideEndScoreAnnouncement,
	showWinnerAnnouncement,
	hideWinnerAnnouncement,
	clearCameraFollowStone,
	clampCameraPosition,
	camera,
	scoreboardState,
	teamThinkTimeRemaining,
	updateTimerLabel,
	baseEnds: BASE_ENDS,
	teamThinkTimeSeconds: TEAM_THINK_TIME_SECONDS,
	extraEndThinkTimeSeconds: EXTRA_END_THINK_TIME_SECONDS,
	houseRadius: HOUSE_RADIUS,
	stoneRadius: STONE_RADIUS,
	stonesPerTeam: STONES_PER_TEAM,
	scoringSettings: {
		cameraTargetY: SCORE_CAMERA_TARGET_Y,
		cameraLerp: SCORE_CAMERA_LERP,
		cameraSettleMs: SCORE_CAMERA_SETTLE_MS,
		removeIntervalMs: SCORE_REMOVE_INTERVAL_MS,
		messageDurationMs: SCORE_MESSAGE_DURATION_MS,
		postMessageDelayMs: SCORE_POST_MESSAGE_DELAY_MS
	},
	setTimerDisplayColor: (value) => {
		timerDisplayColor = value;
	}
});

function setupWakeLock() {
	if (!('wakeLock' in navigator)) {
		return;
	}
	requestWakeLock();
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			requestWakeLock();
		}
	});
	window.addEventListener('focus', requestWakeLock);
	window.addEventListener('blur', releaseWakeLock);
	window.addEventListener('beforeunload', releaseWakeLock);
	window.addEventListener('pagehide', releaseWakeLock);
}

async function requestWakeLock() {
	if (!('wakeLock' in navigator) || wakeLockSentinel) {
		return;
	}
	try {
		wakeLockSentinel = await navigator.wakeLock.request('screen');
		wakeLockSentinel.addEventListener('release', () => {
			wakeLockSentinel = null;
		});
	} catch (error) {
		console.warn('Wake Lock request failed:', error);
		wakeLockSentinel = null;
	}
}

async function releaseWakeLock() {
	if (!wakeLockSentinel) {
		return;
	}
	try {
		await wakeLockSentinel.release();
	} catch (error) {
		console.warn('Wake Lock release failed:', error);
	} finally {
		wakeLockSentinel = null;
	}
}

function registerServiceWorker() {
	if (!('serviceWorker' in navigator)) {
		return;
	}
	window.addEventListener('load', () => {
		navigator.serviceWorker
			.register('./sw.js')
			.catch((error) => console.warn('Service Worker registration failed:', error));
	});
}

setupWakeLock();
registerServiceWorker();

function resizeCanvas() {
	if (!canvas || !ctx) {
		return;
	}

	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;

	const horizontalSpan = SHEET_EXTENTS.xMax - SHEET_EXTENTS.xMin;
	const verticalSpan = SHEET_EXTENTS.yMax - SHEET_EXTENTS.yMin;
	const padding = 0.9;
	const widthScale = (canvas.width * padding) / horizontalSpan;
	const heightScale = (canvas.height * padding) / verticalSpan;
	const newBaseScale = Math.min(widthScale, heightScale);
	const newWidthFillScale = canvas.width / horizontalSpan;
	const newMaxZoom = newWidthFillScale / newBaseScale;
	setScaleData({
		baseScale: newBaseScale,
		widthFillScale: newWidthFillScale,
		maxZoom: newMaxZoom
	});

	const desiredWidthFraction = canvas.width >= canvas.height ? 0.5 : 1;
	const targetSpan = horizontalSpan + (SIDE_BUFFER_METERS * 2);
	const desiredDisplayScale = (canvas.width * desiredWidthFraction) / targetSpan;
	let targetZoom = desiredDisplayScale / newBaseScale;
	if (currentMode === GameMode.TUTORIAL && canvas.width > canvas.height) {
		targetZoom *= 0.5;
	}
	if (!hasInitializedCameraView) {
		setCameraZoom(targetZoom);
		camera.x = CAMERA_CENTER_X;
		camera.y = (SHEET_EXTENTS.yMin + SHEET_EXTENTS.yMax) / 2;
		hasInitializedCameraView = true;
	} else {
		setCameraZoom(targetZoom);
	}
	centerCameraHorizontal();
	clampCameraPosition();
	updateScoreboardLayout();
	drawTrack(buildRenderState());
}

function buildRenderState() {
	return {
		measurements: MEASUREMENTS,
		lineMarkings: LINE_MARKINGS,
		sheetExtents: SHEET_EXTENTS,
		backLineY: BACK_LINE_Y,
		hogLineNearY: HOG_LINE_NEAR_Y,
		hogLineFarY: HOG_LINE_FAR_Y,
		stoneRadius: STONE_RADIUS,
		dragState: inputController.getDragState(),
		physicsEngine,
		getThrowSpeed,
		feetToMeters: FEET_TO_METERS,
		minimap: {
			hidden: minimapHidden,
			yMin: MINIMAP_Y_MIN,
			yMax: MINIMAP_Y_MAX,
			scaleFraction: MINIMAP_SCALE_FRACTION,
			marginPx: MINIMAP_MARGIN_PX
		},
		readyStoneKey,
		isEndInProgress,
		scoringSequence,
		hogSponsor: {
			width: HOG_SPONSOR_WIDTH,
			marginX: HOG_SPONSOR_MARGIN_X,
			offsetY: HOG_SPONSOR_OFFSET_Y,
			pixelHeight: HOG_SPONSOR_PIXEL_HEIGHT,
			scale: HOG_SPONSOR_SCALE
		},
		hogImages: {
			right: hogLineRightImage,
			left: hogLineLeftImage,
			farRight: hogLineFarRightImage,
			farLeft: hogLineFarLeftImage,
			midRight: hogLineMidRightImage,
			midLeft: hogLineMidLeftImage
		},
		tutorial: {
			currentMode,
			tutorialMode: GameMode.TUTORIAL,
			step: tutorialController.getState().step,
			demoStart: tutorialController.getState().demoStart,
			demoTime: tutorialController.getState().demoTime,
			launchStartY: LAUNCH_START_Y,
			hogLineNearY: HOG_LINE_NEAR_Y,
			feetToMeters: FEET_TO_METERS,
			nearHackTop: NEAR_HACK_TOP,
			redStoneConfigs,
			yellowStoneConfigs,
			stoneRadius: STONE_RADIUS,
			getThrowSpeed
		}
	};
}

function handleStoneStopped(stone) {
	const followStone = getCameraFollowStone();
	if (stone && stone === followStone) {
		clearCameraFollowStone();
	}
	if (stone && getStoneKey(stone) === lastLaunchedStoneKey) {
		lastLaunchedStoneKey = null;
	}
	if (stone?.isOut && !stone?.hogTiming?.nearCrossedAt) {
		stopThinkingTimer();
	}
	inputController.clearSweepState();
	nextReadyAllowedAt = performance.now() + 2000;
}

function handleHogNearCross() {
	stopThinkingTimer();
}

function getThrowSpeed(pullbackMeters) {
	const ratio = MAX_PULLBACK_METERS > 0
		? clamp(pullbackMeters / MAX_PULLBACK_METERS, 0, 1)
		: 0;
	const eased = Math.pow(ratio, 5);
	return MIN_THROW_SPEED + ((MAX_THROW_SPEED - MIN_THROW_SPEED) * eased);
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}
function getStoneKey(stone) {
	return stone ? `${stone.color}:${stone.number}` : null;
}

function getStoneByKey(key) {
	if (!key) {
		return null;
	}
	return physicsEngine.getStones().find((stone) => getStoneKey(stone) === key) ?? null;
}

function isStoneAvailable(stone) {
	return !!stone && !stone.isLaunched && !stone.isOut;
}

function getOppositeColor(color) {
	return color === StoneColor.RED ? StoneColor.YELLOW : StoneColor.RED;
}

function getColorForThrowIndex(index) {
	if (currentMode === GameMode.PRACTICE) {
		return StoneColor.RED;
	}
	return index % 2 === 0 ? startingTeamColor : getOppositeColor(startingTeamColor);
}

function findNextAvailableStone(color) {
	const stones = physicsEngine
		.getStones()
		.filter((stone) => stone.color === color && isStoneAvailable(stone))
		.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
	return stones[0] ?? null;
}

function resetStoneForLaunch(stone, position) {
	stone.position = { ...position };
	stone.velocity = { vx: 0, vy: 0 };
	stone.pendingRotationRate = 0;
	stone.rotationRate = 0;
	stone.rotationActivated = true;
	stone.angle = 0;
	stone.isLaunched = false;
	stone.isOut = false;
	stone.hasStoppedNotified = true;
}

function ensureReadyStone() {
	if (!isEndInProgress || isGameOver || scoringSequence || physicsEngine.isRunning() || inputController.getDragState()) {
		return;
	}
	if (menuVisible) {
		return;
	}
	if (minimapHidden) {
		return;
	}
	if (performance.now() < nextReadyAllowedAt) {
		return;
	}
	if (nextTeamColorPending) {
		setActiveTeamColor(nextTeamColorPending);
		nextTeamColorPending = null;
	}
	const startPosition = { x: 0, y: LAUNCH_START_Y };
	const current = getStoneByKey(readyStoneKey);
	if (isStoneAvailable(current)) {
		resetStoneForLaunch(current, startPosition);
		camera.y = getCameraYForLaunch(startPosition.y);
		clampCameraPosition({ allowBeyondBottom: true });
		startThinkingTimer(scoreboardState.activeTeamColor);
		return;
	}
	let nextStone = findNextAvailableStone(scoreboardState.activeTeamColor);
	if (!nextStone) {
		const alternateColor = getOppositeColor(scoreboardState.activeTeamColor);
		nextStone = findNextAvailableStone(alternateColor);
		if (!nextStone) {
			readyStoneKey = null;
			return;
		}
		setActiveTeamColor(alternateColor);
	}
	if (!nextStone) {
		readyStoneKey = null;
		return;
	}
	readyStoneKey = getStoneKey(nextStone);
	resetStoneForLaunch(nextStone, startPosition);
	camera.y = getCameraYForLaunch(startPosition.y);
	clampCameraPosition({ allowBeyondBottom: true });
	startThinkingTimer(scoreboardState.activeTeamColor);
}

function createTeamStoneConfigs({ color, baseX, baseY, direction }) {
	const configs = [];
	const columnIndices = Array.from({ length: STONE_TRAY_COLUMNS }, (_, idx) => idx).sort(
		(a, b) => {
			const ax = baseX + direction * a * STONE_TRAY_COLUMN_SPACING;
			const bx = baseX + direction * b * STONE_TRAY_COLUMN_SPACING;
			return Math.abs(ax) - Math.abs(bx);
		}
	);

	let number = 1;
	for (let row = STONE_TRAY_ROWS - 1; row >= 0; row--) {
		const y = baseY + row * STONE_TRAY_ROW_SPACING;
		for (const col of columnIndices) {
			const x = baseX + direction * col * STONE_TRAY_COLUMN_SPACING;
			configs.push({
				color,
				number,
				position: { x, y }
			});
			number += 1;
		}
	}

	return configs;
}

function createOutTraySlots({ baseX, baseY, horizontalDirection }) {
	const slots = [];
	const rowPositions = Array.from({ length: STONE_TRAY_ROWS }, (_, row) =>
		baseY - row * STONE_TRAY_ROW_SPACING
	);
	const columnOffsets = [0, horizontalDirection * STONE_TRAY_COLUMN_SPACING];

	for (const colIndex of [0, 1]) {
		const x = baseX + columnOffsets[colIndex];
		for (const y of rowPositions) {
			slots.push({ x, y });
		}
	}
	return slots;
}

mountScoreboard();
mountTimer();
mountWinnerAnnouncement();
mountEndScoreAnnouncement();
mountMenu();

window.addEventListener('resize', resizeCanvas, { passive: true });
canvas?.addEventListener('pointerdown', inputController.onPointerDown);
canvas?.addEventListener('pointermove', inputController.onPointerMove);
canvas?.addEventListener('pointerup', inputController.onPointerUp);
canvas?.addEventListener('pointercancel', inputController.onPointerUp);
canvas?.addEventListener('pointerleave', inputController.onPointerLeave);

function animationLoop(timestamp) {
	tutorialController.update(timestamp);
	gameplayController.updateScoringSequence(timestamp);
	ensureReadyStone();
	updateThinkingTimer(timestamp);
	physicsEngine.update(timestamp);
	if (!menuVisible && currentMode !== GameMode.TUTORIAL) {
		updateCameraFollow();
	}
	gameplayController.maybeHandleEndCompletion();
	drawTrack(buildRenderState());
	requestAnimationFrame(animationLoop);
}

resizeCanvas();
requestAnimationFrame(animationLoop);
