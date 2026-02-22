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

const canvas = document.getElementById('curling-canvas');
const ctx = canvas?.getContext('2d');

const FEET_TO_METERS = 0.3048;
const INCHES_TO_METERS = 0.0254;
const LBS_TO_KG = 0.45359237;
const MINUTES_TO_SECONDS = 60;
const STONE_WEIGHT = 42 * LBS_TO_KG;
const CURLING_STONE_DIAMETER = 11.5 * INCHES_TO_METERS;
const STONE_RADIUS = CURLING_STONE_DIAMETER / 2;
const STONE_TRAY_COLUMNS = 2;
const STONE_TRAY_ROWS = 4;
const STONE_TRAY_COLUMN_SPACING = STONE_RADIUS * 2.4;
const STONE_TRAY_ROW_SPACING = STONE_RADIUS * 2.4;
const STONE_TRAY_BOTTOM_MARGIN = STONE_RADIUS * 1.5;
const STONE_TRAY_SIDE_MARGIN = STONE_RADIUS * 1.2;
const SIDE_BUFFER_METERS = 2 * INCHES_TO_METERS;

const MEASUREMENTS = Object.freeze({
	trackLength: 150 * FEET_TO_METERS,
	trackWidth: (15 * FEET_TO_METERS) + (7 * INCHES_TO_METERS),
	teeToHack: 132 * FEET_TO_METERS,
	hackCenterOffset: 6 * FEET_TO_METERS,
	hackWidth: 6 * INCHES_TO_METERS,
	hackSpacing: 6 * INCHES_TO_METERS,
	hackLength: 8 * INCHES_TO_METERS,
	rings: Object.freeze({
		blueInner: 6 * INCHES_TO_METERS,
		blueOuter: 2 * FEET_TO_METERS,
		redInner: 4 * FEET_TO_METERS,
		redOuter: 6 * FEET_TO_METERS
	})
});

const LINE_MARKINGS = Object.freeze({
	hog: Object.freeze({
		distanceFromBottom: 39 * FEET_TO_METERS,
		thickness: 4 * INCHES_TO_METERS,
		color: '#2e7d32'
	}),
	tee: Object.freeze({
		distanceFromBottom: 132 * FEET_TO_METERS,
		thickness: 0.5 * INCHES_TO_METERS,
		color: '#1b4e8c'
	}),
	back: Object.freeze({
		distanceFromBottom: 138 * FEET_TO_METERS,
		thickness: 0.5 * INCHES_TO_METERS,
		color: '#0d47a1'
	}),
	center: Object.freeze({
		thickness: 0.5 * INCHES_TO_METERS,
		color: '#1b4e8c'
	})
});

const SHEET_EXTENTS = Object.freeze({
	xMin: -MEASUREMENTS.trackWidth / 2,
	xMax: MEASUREMENTS.trackWidth / 2,
	yMin: -MEASUREMENTS.teeToHack,
	yMax: MEASUREMENTS.trackLength - MEASUREMENTS.teeToHack
});
const CAMERA_CENTER_X = (SHEET_EXTENTS.xMin + SHEET_EXTENTS.xMax) / 2;

function yFromBottom(distanceMeters) {
	return SHEET_EXTENTS.yMin + distanceMeters;
}

function yFromTop(distanceMeters) {
	return SHEET_EXTENTS.yMax - distanceMeters;
}

const NEAR_HACK_CENTER = yFromBottom(MEASUREMENTS.hackCenterOffset);
const NEAR_HACK_TOP = NEAR_HACK_CENTER + (MEASUREMENTS.hackLength / 2);
const LAUNCH_START_Y = NEAR_HACK_TOP + STONE_RADIUS + 0.05;
const HOG_LINE_NEAR_Y = yFromBottom(LINE_MARKINGS.hog.distanceFromBottom);
const HOG_LINE_FAR_Y = yFromTop(LINE_MARKINGS.hog.distanceFromBottom);
const BACK_LINE_Y = yFromBottom(LINE_MARKINGS.back.distanceFromBottom);
const MINIMAP_Y_MIN = HOG_LINE_FAR_Y;
const MINIMAP_Y_MAX = BACK_LINE_Y;
const FAR_TRAY_BASE_Y = SHEET_EXTENTS.yMax - STONE_TRAY_BOTTOM_MARGIN;
const redFarTrayBaseX = SHEET_EXTENTS.xMax - STONE_TRAY_SIDE_MARGIN;
const yellowFarTrayBaseX = SHEET_EXTENTS.xMin + STONE_TRAY_SIDE_MARGIN;
const HOG_SPONSOR_WIDTH = 6 * FEET_TO_METERS;
const HOG_SPONSOR_MARGIN_X = 1;
const HOG_SPONSOR_OFFSET_Y = -2;
const HOG_SPONSOR_PIXEL_HEIGHT = 720;
const HOG_SPONSOR_SCALE = 0.8;
const MINIMAP_SCALE_FRACTION = 0.2;
const MINIMAP_MARGIN_PX = 10;
const MAX_PULLBACK_FEET = 8;
const MAX_PULLBACK_METERS = MAX_PULLBACK_FEET * FEET_TO_METERS;
const MAX_THROW_SPEED = 3.5;
const MIN_THROW_SPEED = 2;
const MAX_ROTATION_RATE = 4;
const ROTATION_SWIPE_REFERENCE_DISTANCE = 4;
const ROTATION_SWIPE_REFERENCE_TIME = 1;
const SWEEP_FRICTION_REDUCTION = 0.4;
const SWEEP_CURL_BOOST = 0.25;
const SWEEP_MIN_DISTANCE_PX = 8;
const SWEEP_DIRECTION_RATIO = 1.5;
const STONE_SCREEN_FRACTION_FROM_BOTTOM = 0.3;
const TEAM_THINK_TIME_SECONDS = 38 * MINUTES_TO_SECONDS;

const camera = {
	x: 0,
	y: 0,
	zoom: 0.1
};

const GameMode = Object.freeze({
	MENU: 'menu',
	PRACTICE: 'practice',
	TWO_PLAYER: 'twoPlayer',
	TUTORIAL: 'tutorial',
	AI: 'ai',
	FRIEND: 'friend'
});


let wakeLockSentinel = null;

setupWakeLock();
registerServiceWorker();

const launchSound = new Audio('snd/launch.ogg');
launchSound.preload = 'auto';
launchSound.load();

function createSoundPool(src, size = 6) {
	const pool = Array.from({ length: size }, () => {
		const audio = new Audio(src);
		audio.preload = 'auto';
		audio.load();
		return audio;
	});
	let nextIndex = 0;
	return {
		play() {
			const available = pool.find((audio) => audio.paused || audio.ended);
			const audio = available ?? pool[nextIndex++ % pool.length];
			audio.currentTime = 0;
			audio.play().catch(() => {});
		}
	};
}

const impactLowSounds = createSoundPool('snd/impact_low.ogg');
const impactMediumSounds = createSoundPool('snd/impact_medium.ogg');
const impactHighSounds = createSoundPool('snd/impact_high.ogg');
const faultSounds = createSoundPool('snd/fault.ogg', 3);

function handleStoneCollision(speed) {
	if (speed < 0.5) {
		impactLowSounds.play();
		return;
	}
	if (speed < 1) {
		impactMediumSounds.play();
		return;
	}
	impactHighSounds.play();
}

function handleStoneOut(stone, reason) {
	if ((reason === 'outOfBounds' || reason === 'hog') && getStoneKey(stone) === lastLaunchedStoneKey) {
		if (launchSound && !launchSound.paused) {
			launchSound.pause();
			launchSound.currentTime = 0;
		}
		faultSounds.play();
	}
}

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

const physicsEngine = new PhysicsEngine({
	launchY: LAUNCH_START_Y,
	stoneRadius: STONE_RADIUS,
	hogLineNear: HOG_LINE_NEAR_Y,
	hogLineFar: HOG_LINE_FAR_Y,
	sheetExtents: SHEET_EXTENTS,
	backLineY: BACK_LINE_Y,
	onStoneStopped: handleStoneStopped,
	onHogNearCross: handleHogNearCross,
	onStoneCollision: handleStoneCollision,
	onStoneOut: handleStoneOut
});

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

physicsEngine.initializeStones([...redStoneConfigs, ...yellowStoneConfigs]);

const redOutTraySlots = createOutTraySlots({
	baseX: redFarTrayBaseX,
	baseY: FAR_TRAY_BASE_Y,
	horizontalDirection: -1
});

const yellowOutTraySlots = createOutTraySlots({
	baseX: yellowFarTrayBaseX,
	baseY: FAR_TRAY_BASE_Y,
	horizontalDirection: 1
});

physicsEngine.setOutTrayLayouts({
	[StoneColor.RED]: redOutTraySlots,
	[StoneColor.YELLOW]: yellowOutTraySlots
});

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

let scoreboardElement = null;
let currentEndIndex = 0;
let startingTeamColor = StoneColor.RED;
let isEndInProgress = false;
let endResultCommitted = false;
const HOUSE_RADIUS = MEASUREMENTS.rings.redOuter;
const trayPositionLookup = {
	[StoneColor.RED]: buildTrayLookup(redStoneConfigs),
	[StoneColor.YELLOW]: buildTrayLookup(yellowStoneConfigs)
};
let winnerAnnouncementElement = null;
let isGameOver = false;
let endScoreAnnouncementElement = null;
let scoringSequence = null;
let dragState = null;
let swipeState = null;
let sweepState = null;
let minimapBounds = null;
let minimapPeekPointerId = null;
let minimapHidden = false;
let minimapPeekPreviousZoom = null;
let pendingRoundAction = null;
let acknowledgePointerId = null;
let scoreboardVisible = false;
let menuElement = null;
let menuVisible = false;
let currentMode = GameMode.MENU;
let tutorialStep = 0;
let tutorialDemoStart = null;
let tutorialDemoTime = 0;
let tutorialCameraTargetY = null;
let timerElement = null;
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

const SCORE_CAMERA_TARGET_Y = 0;
const SCORE_CAMERA_LERP = 0.08;
const SCORE_CAMERA_SETTLE_MS = 450;
const SCORE_REMOVE_INTERVAL_MS = 320;
const SCORE_MESSAGE_DURATION_MS = 1600;
const SCORE_POST_MESSAGE_DELAY_MS = 2000;
const EXTRA_END_THINK_TIME_SECONDS = 270;

function buildTrayLookup(configs) {
	const map = new Map();
	configs.forEach((config) => {
		map.set(config.number, { ...config.position });
	});
	return map;
}

function getTotalScheduledEnds() {
	const firstTeam = scoreboardState.teams[0];
	return firstTeam ? firstTeam.scores.length : BASE_ENDS;
}

function ensureScoreCapacity(endIndex) {
	scoreboardState.teams.forEach((team) => {
		while (team.scores.length <= endIndex) {
			team.scores.push('');
		}
	});
}

function addExtraEndColumn() {
	scoreboardState.teams.forEach((team) => {
		team.scores.push('');
	});
	teamThinkTimeRemaining[StoneColor.RED] += EXTRA_END_THINK_TIME_SECONDS;
	teamThinkTimeRemaining[StoneColor.YELLOW] += EXTRA_END_THINK_TIME_SECONDS;
	updateTimerLabel();
}

function createScoreboardElement() {
	const container = document.createElement('div');
	container.className = 'scoreboard-container';
	const table = document.createElement('table');
	table.setAttribute('aria-label', 'Curling scoreboard');
	container.appendChild(table);
	return container;
}


function renderScoreboard() {
	if (!scoreboardElement) {
		return;
	}
	const table = scoreboardElement.querySelector('table');
	if (!table) {
		return;
	}
	table.innerHTML = '';
	const headerRow = document.createElement('tr');
	const headers = ['Team'];
	const scheduledEnds = getTotalScheduledEnds();
	const activeEndIndex =
		isGameOver || scheduledEnds === 0
			? null
			: Math.min(currentEndIndex, Math.max(0, scheduledEnds - 1));
	for (let endIndex = 1; endIndex <= scheduledEnds; endIndex += 1) {
		headers.push(String(endIndex));
	}
	headers.push('Total');
	headers.forEach((label, idx) => {
		const th = document.createElement('th');
		th.textContent = label;
		if (idx === headers.length - 1) {
			th.classList.add('total-cell');
		}
		const isEndHeader = idx > 0 && idx <= scheduledEnds;
		if (isEndHeader && activeEndIndex != null && (idx - 1) === activeEndIndex) {
			th.classList.add('active-end');
		}
		headerRow.appendChild(th);
	});
	table.appendChild(headerRow);

	scoreboardState.teams.forEach((team) => {
		const row = document.createElement('tr');
		const nameCell = document.createElement('td');
		const isActive = scoreboardState.activeTeamColor === team.stoneColor;
		nameCell.textContent = `${team.name}${isActive ? ' *' : ''}`;
		nameCell.style.color = team.displayColor;
		row.appendChild(nameCell);

		team.scores.forEach((score) => {
			const scoreCell = document.createElement('td');
			scoreCell.textContent = score ?? '';
			row.appendChild(scoreCell);
		});

		const totalCell = document.createElement('td');
		totalCell.classList.add('total-cell');
		totalCell.textContent = team.total ?? '';
		row.appendChild(totalCell);
		table.appendChild(row);
	});

}

function updateScoreboardLayout() {
	if (!scoreboardElement || !canvas) {
		return;
	}
	const trackWidthPx = MEASUREMENTS.trackWidth * displayScale;
	const targetWidth = Math.min(canvas.width - 32, trackWidthPx);
	scoreboardElement.style.width = 'max-content';
	scoreboardElement.style.left = '50%';
	scoreboardElement.style.right = 'auto';
	scoreboardElement.style.top = 'auto';
	scoreboardElement.style.bottom = '16px';
	scoreboardElement.style.transformOrigin = 'bottom center';
	const naturalWidth = scoreboardElement.offsetWidth || 1;
	const scale = targetWidth > 0 ? targetWidth / naturalWidth : 1;
	scoreboardElement.style.transform = `translateX(-50%) scale(${scale})`;
}

function setScoreboardVisible(visible) {
	scoreboardVisible = visible;
	if (!scoreboardElement) {
		return;
	}
	scoreboardElement.classList.toggle('is-visible', visible);
	if (visible) {
		updateScoreboardLayout();
	}
}

function mountScoreboard() {
	scoreboardElement = createScoreboardElement();
	const attach = () => {
		if (!document.body.contains(scoreboardElement)) {
			document.body.appendChild(scoreboardElement);
		}
		renderScoreboard();
		setScoreboardVisible(false);
	};
	if (document.body) {
		attach();
	} else {
		window.addEventListener('DOMContentLoaded', attach, { once: true });
	}
}

function createTimerElement() {
	const el = document.createElement('div');
	el.className = 'think-timer';
	el.setAttribute('role', 'status');
	el.setAttribute('aria-live', 'polite');
	el.textContent = '';
	return el;
}

function mountTimer() {
	timerElement = createTimerElement();
	const attach = () => {
		if (!document.body.contains(timerElement)) {
			document.body.appendChild(timerElement);
		}
		updateTimerLabel();
	};
	if (document.body) {
		attach();
	} else {
		window.addEventListener('DOMContentLoaded', attach, { once: true });
	}
}

function formatTimer(seconds) {
	const safeSeconds = Math.max(0, Math.ceil(seconds));
	const minutes = Math.floor(safeSeconds / 60);
	const remainingSeconds = safeSeconds % 60;
	return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function updateTimerLabel() {
	if (!timerElement) {
		return;
	}
	const displayColor = timerDisplayColor ?? scoreboardState.activeTeamColor;
	timerElement.textContent = formatTimer(teamThinkTimeRemaining[displayColor]);
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
		concludeGame(winningTeam);
	}
}

function createWinnerAnnouncementElement() {
	const el = document.createElement('div');
	el.className = 'winner-announcement';
	el.setAttribute('role', 'status');
	el.setAttribute('aria-live', 'polite');
	el.textContent = '';
	return el;
}

function createEndScoreAnnouncementElement() {
	const el = document.createElement('div');
	el.className = 'end-score-announcement';
	el.setAttribute('role', 'status');
	el.setAttribute('aria-live', 'polite');
	el.textContent = '';
	return el;
}

function mountWinnerAnnouncement() {
	winnerAnnouncementElement = createWinnerAnnouncementElement();
	const attach = () => {
		if (!document.body.contains(winnerAnnouncementElement)) {
			document.body.appendChild(winnerAnnouncementElement);
		}
	};
	if (document.body) {
		attach();
	} else {
		window.addEventListener('DOMContentLoaded', attach, { once: true });
	}
}

function mountEndScoreAnnouncement() {
	endScoreAnnouncementElement = createEndScoreAnnouncementElement();
	const attach = () => {
		if (!document.body.contains(endScoreAnnouncementElement)) {
			document.body.appendChild(endScoreAnnouncementElement);
		}
	};
	if (document.body) {
		attach();
	} else {
		window.addEventListener('DOMContentLoaded', attach, { once: true });
	}
}

function showWinnerAnnouncement(message) {
	if (!winnerAnnouncementElement) {
		return;
	}
	winnerAnnouncementElement.textContent = message;
	winnerAnnouncementElement.classList.add('visible');
}

function hideWinnerAnnouncement() {
	if (!winnerAnnouncementElement) {
		return;
	}
	winnerAnnouncementElement.classList.remove('visible');
}

function showEndScoreAnnouncement(message) {
	if (!endScoreAnnouncementElement) {
		return;
	}
	endScoreAnnouncementElement.textContent = message;
	endScoreAnnouncementElement.classList.add('visible');
}

function hideEndScoreAnnouncement() {
	if (!endScoreAnnouncementElement) {
		return;
	}
	endScoreAnnouncementElement.classList.remove('visible');
}

function createMenuButton(label, onClick) {
	const button = document.createElement('button');
	button.type = 'button';
	button.textContent = label;
	button.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (onClick) {
			onClick();
		}
	});
	return button;
}

function createMenuElement() {
	const container = document.createElement('div');
	container.className = 'game-menu';
	container.appendChild(createMenuButton('Practice', startPracticeGame));
	container.appendChild(createMenuButton('Two player', startTwoPlayerGame));
	container.appendChild(createMenuButton('Play against AI'));
	container.appendChild(createMenuButton('Play agaisnt friend'));
	container.appendChild(createMenuButton('Tutorial', startTutorial));
	container.appendChild(createMenuButton('Rules', () => window.open('https://worldcurling.org/rules/', '_blank', 'noopener')));
	return container;
}

function mountMenu() {
	menuElement = createMenuElement();
	const attach = () => {
		if (!document.body.contains(menuElement)) {
			document.body.appendChild(menuElement);
		}
		showMenu();
	};
	if (document.body) {
		attach();
	} else {
		window.addEventListener('DOMContentLoaded', attach, { once: true });
	}
}

function showMenu() {
	menuVisible = true;
	currentMode = GameMode.MENU;
	minimapHidden = true;
	if (menuElement) {
		menuElement.classList.add('visible');
	}
	if (timerElement) {
		timerElement.classList.add('is-hidden');
	}
	sweepState = null;
	dragState = null;
	swipeState = null;
	pendingRoundAction = null;
	acknowledgePointerId = null;
	endResultCommitted = false;
	isEndInProgress = false;
	stopThinkingTimer();
	setScoreboardVisible(false);
	hideEndScoreAnnouncement();
	hideWinnerAnnouncement();
}

function hideMenu() {
	menuVisible = false;
	if (menuElement) {
		menuElement.classList.remove('visible');
	}
	if (timerElement) {
		timerElement.classList.remove('is-hidden');
	}
}

function startTwoPlayerGame() {
	currentMode = GameMode.TWO_PLAYER;
	minimapHidden = false;
	hideMenu();
	resetGameState();
	startNewEnd(StoneColor.RED);
}

function startPracticeGame() {
	currentMode = GameMode.PRACTICE;
	minimapHidden = false;
	hideMenu();
	resetGameState();
	setScoreboardVisible(false);
	startNewEnd(StoneColor.RED);
}

function startTutorial() {
	currentMode = GameMode.TUTORIAL;
	minimapHidden = true;
	tutorialStep = 0;
	tutorialDemoStart = null;
	tutorialDemoTime = 0;
	tutorialCameraTargetY = null;
	hideMenu();
	resetStonesToHomeTrays();
	setScoreboardVisible(false);
	stopThinkingTimer();
	if (timerElement) {
		timerElement.classList.add('is-hidden');
	}
	setCameraToHackView();
	resizeCanvas();
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
	cameraFollowStone = null;
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

function getRemainingStones(color) {
	const stones = physicsEngine.getStones().filter((stone) => stone.color === color);
	const used = stones.reduce((count, stone) => {
		if (stone.isLaunched || stone.isOut) {
			return count + 1;
		}
		return count;
	}, 0);
	return Math.max(0, STONES_PER_TEAM - used);
}

function areAllThrowsCompleted() {
	return scoreboardState.teams.every(
		(team) => getRemainingStones(team.stoneColor) === 0
	);
}

function hasMultipleColors(stones) {
	if (stones.length === 0) {
		return false;
	}
	const firstColor = stones[0].color;
	return stones.some((stone) => stone.color !== firstColor);
}

function maybeHandleEndCompletion() {
	if (currentMode === GameMode.PRACTICE) {
		if (!isEndInProgress) {
			return;
		}
		if (getRemainingStones(StoneColor.RED) > 0) {
			return;
		}
		if (physicsEngine.isRunning() || dragState) {
			return;
		}
		showMenu();
		return;
	}
	if (!isEndInProgress || endResultCommitted) {
		return;
	}
	if (!areAllThrowsCompleted()) {
		return;
	}
	if (physicsEngine.isRunning() || dragState) {
		return;
	}
	if (!scoringSequence) {
		startScoreAnimation();
	}
}

function scoreCurrentEnd() {
	ensureScoreCapacity(currentEndIndex);
	const stones = physicsEngine.getStones();
	const scoringRadius = HOUSE_RADIUS + STONE_RADIUS;
	const stonesInHouse = [];
	const stonesOutsideHouse = [];
	for (const stone of stones) {
		if (!stone.isLaunched) {
			continue;
		}
		const distance = Math.hypot(stone.position.x, stone.position.y);
		if (distance > scoringRadius) {
			stonesOutsideHouse.push(stone);
		} else {
			stonesInHouse.push({ stone, distance });
		}
	}
	stonesOutsideHouse.forEach(relocateStoneToOutTray);
	if (stonesInHouse.length === 0) {
		finalizeEndResult(null, 0);
		return;
	}
	stonesInHouse.sort((a, b) => a.distance - b.distance);
	const ordered = stonesInHouse.map((entry) => entry.stone);
	while (ordered.length > 0 && hasMultipleColors(ordered)) {
		const removed = ordered.pop();
		relocateStoneToOutTray(removed);
	}
	const winningColor = ordered.length > 0 ? ordered[0].color : null;
	const points = ordered.length;
	finalizeEndResult(winningColor, points);
}

function buildEndScoringPlan() {
	const stones = physicsEngine.getStones();
	const scoringRadius = HOUSE_RADIUS + STONE_RADIUS;
	const stonesInHouse = [];
	const stonesOutsideHouse = [];
	for (const stone of stones) {
		if (!stone.isLaunched || stone.isOut) {
			continue;
		}
		const distance = Math.hypot(stone.position.x, stone.position.y);
		if (distance > scoringRadius) {
			stonesOutsideHouse.push(stone);
		} else {
			stonesInHouse.push({ stone, distance });
		}
	}

	if (stonesInHouse.length === 0) {
		return {
			winningColor: null,
			points: 0,
			removalQueue: stonesOutsideHouse
		};
	}

	stonesInHouse.sort((a, b) => a.distance - b.distance);
	const ordered = stonesInHouse.map((entry) => entry.stone);
	const removalQueue = [...stonesOutsideHouse];
	while (ordered.length > 0 && hasMultipleColors(ordered)) {
		const removed = ordered.pop();
		if (removed) {
			removalQueue.push(removed);
		}
	}
	const winningColor = ordered.length > 0 ? ordered[0].color : null;
	const points = ordered.length;
	return {
		winningColor,
		points,
		removalQueue
	};
}

function startScoreAnimation() {
	if (scoringSequence) {
		return;
	}
	const plan = buildEndScoringPlan();
	cameraFollowStone = null;
	scoringSequence = {
		phase: 'camera',
		winningColor: plan.winningColor,
		points: plan.points,
		removalQueue: plan.removalQueue,
		nextRemoveAt: null,
		cameraSettledAt: null,
		messageShown: false,
		messageHidden: false,
		messageHideAt: null,
		messageEndAt: null
	};
}

function getTeamNameByColor(color) {
	const team = scoreboardState.teams.find((entry) => entry.stoneColor === color);
	return team?.name ?? 'Team';
}

function updateScoringSequence(timestamp) {
	if (!scoringSequence) {
		return;
	}
	if (currentMode === GameMode.TUTORIAL) {
		return;
	}

	if (scoringSequence.phase === 'camera') {
		const delta = SCORE_CAMERA_TARGET_Y - camera.y;
		camera.y += delta * SCORE_CAMERA_LERP;
		clampCameraPosition();
		if (Math.abs(delta) < 0.08) {
			if (scoringSequence.cameraSettledAt == null) {
				scoringSequence.cameraSettledAt = timestamp;
			}
			if (timestamp - scoringSequence.cameraSettledAt >= SCORE_CAMERA_SETTLE_MS) {
				scoringSequence.phase = 'removing';
				scoringSequence.nextRemoveAt = timestamp + SCORE_REMOVE_INTERVAL_MS;
			}
		} else {
			scoringSequence.cameraSettledAt = null;
		}
		return;
	}

	if (scoringSequence.phase === 'removing') {
		if (scoringSequence.removalQueue.length === 0) {
			scoringSequence.phase = 'announce';
			scoringSequence.messageEndAt = timestamp + SCORE_MESSAGE_DURATION_MS;
			return;
		}

		if (timestamp >= (scoringSequence.nextRemoveAt ?? 0)) {
			const nextStone = scoringSequence.removalQueue.shift();
			if (nextStone) {
				relocateStoneToOutTray(nextStone);
				renderScoreboard();
			}
			scoringSequence.nextRemoveAt = timestamp + SCORE_REMOVE_INTERVAL_MS;
		}
		return;
	}

	if (scoringSequence.phase === 'announce') {
		if (!scoringSequence.messageShown) {
			const { winningColor, points } = scoringSequence;
			const message =
				winningColor && points > 0
					? `${getTeamNameByColor(winningColor)} scores ${points} point${points === 1 ? '' : 's'}`
					: 'No score';
			showEndScoreAnnouncement(message);
			setScoreboardVisible(true);
			scoringSequence.messageShown = true;
			scoringSequence.messageHideAt = timestamp + SCORE_MESSAGE_DURATION_MS;
			scoringSequence.messageEndAt =
				scoringSequence.messageHideAt + SCORE_POST_MESSAGE_DELAY_MS;
		}
		if (!scoringSequence.messageHidden && timestamp >= (scoringSequence.messageHideAt ?? 0)) {
			hideEndScoreAnnouncement();
			scoringSequence.messageHidden = true;
		}
		if (timestamp >= (scoringSequence.messageEndAt ?? 0)) {
			const { winningColor, points } = scoringSequence;
			scoringSequence = null;
			finalizeEndResult(winningColor, points);
		}
	}
}

function recordEndScore(winningColor, points) {
	ensureScoreCapacity(currentEndIndex);
	scoreboardState.teams.forEach((team) => {
		if (winningColor == null) {
			team.scores[currentEndIndex] = '0';
			return;
		}
		if (team.stoneColor === winningColor) {
			team.scores[currentEndIndex] = String(points);
			team.total += points;
		} else {
			team.scores[currentEndIndex] = '0';
		}
	});
	currentEndIndex += 1;
	renderScoreboard();
}

function finalizeEndResult(winningColor, points) {
	endResultCommitted = true;
	isEndInProgress = false;
	recordEndScore(winningColor, points);
	if (winningColor && points > 0) {
		startingTeamColor = winningColor;
	}
	const scheduledEnds = getTotalScheduledEnds();
	const totals = scoreboardState.teams.map((team) => team.total);
	const isTie = totals[0] === totals[1];
	if (currentEndIndex >= scheduledEnds) {
		if (isTie) {
			addExtraEndColumn();
			renderScoreboard();
			pendingRoundAction = 'nextEnd';
			setScoreboardVisible(true);
			return;
		}
		const winningTeam = totals[0] > totals[1] ? scoreboardState.teams[0] : scoreboardState.teams[1];
		concludeGame(winningTeam);
		pendingRoundAction = 'newGame';
		setScoreboardVisible(true);
		return;
	}
	pendingRoundAction = 'nextEnd';
	setScoreboardVisible(true);
}

function startNewEnd(initialColor) {
	if (isGameOver) {
		return;
	}
	startingTeamColor = initialColor;
	ensureScoreCapacity(currentEndIndex);
	resetStonesToHomeTrays();
	currentThrowIndex = 0;
	readyStoneKey = null;
	pendingRoundAction = null;
	acknowledgePointerId = null;
	nextTeamColorPending = null;
	setActiveTeamColor(startingTeamColor);
	hideEndScoreAnnouncement();
	scoringSequence = null;
	renderScoreboard();
	setScoreboardVisible(false);
	stopThinkingTimer();
	isEndInProgress = true;
	endResultCommitted = false;
	hideWinnerAnnouncement();
	ensureReadyStone();
}

function concludeGame(team) {
	isGameOver = true;
	isEndInProgress = false;
	dragState = null;
	readyStoneKey = null;
	const name = team?.name ?? 'Team';
	hideEndScoreAnnouncement();
	showWinnerAnnouncement(`${name} wins!`);
	setScoreboardVisible(true);
	stopThinkingTimer();
}

let baseScale = 1;
let displayScale = 1;
let widthFillScale = 1;
let maxZoom = 1;
const MIN_ZOOM = 0.5;
const CAMERA_FOLLOW_LERP = 0.18;
let hasInitializedCameraView = false;
let cameraFollowStone = null;

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
	baseScale = Math.min(widthScale, heightScale);
	widthFillScale = canvas.width / horizontalSpan;
	maxZoom = widthFillScale / baseScale;

	const desiredWidthFraction = canvas.width >= canvas.height ? 0.5 : 1;
	const targetSpan = horizontalSpan + (SIDE_BUFFER_METERS * 2);
	const desiredDisplayScale = (canvas.width * desiredWidthFraction) / targetSpan;
	let targetZoom = desiredDisplayScale / baseScale;
	if (currentMode === GameMode.TUTORIAL && canvas.width > canvas.height) {
		targetZoom *= 0.5;
	}
	if (!hasInitializedCameraView) {
		camera.zoom = clamp(targetZoom, MIN_ZOOM, maxZoom);
		camera.x = CAMERA_CENTER_X;
		camera.y = (SHEET_EXTENTS.yMin + SHEET_EXTENTS.yMax) / 2;
		hasInitializedCameraView = true;
	} else {
		camera.zoom = clamp(targetZoom, MIN_ZOOM, maxZoom);
	}
	updateDisplayScale();
	centerCameraHorizontal();
	clampCameraPosition();
	updateScoreboardLayout();
	drawTrack();
}

function updateDisplayScale() {
	displayScale = baseScale * camera.zoom;
}

function drawTrack() {
	if (!ctx || !canvas) {
		return;
	}

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	drawSheet();
	drawHouse();
	drawHacks();
	drawGuideLines();
	drawHogLineSponsors();
	drawDragGuides();
	drawStones();
	drawThrowSpeedOverlay();
	drawMiniMap();
	drawTutorialOverlay();
}

function drawSheet() {
	drawRectangle(
		SHEET_EXTENTS.xMin,
		SHEET_EXTENTS.yMin,
		SHEET_EXTENTS.xMax,
		SHEET_EXTENTS.yMax,
		'#d8efff',
		'#8fbbe0'
	);
}

function drawGuideLines() {
	const { xMin, xMax } = SHEET_EXTENTS;

	// center line (physical thickness)
	const halfCenter = LINE_MARKINGS.center.thickness / 2;
	drawRectangle(
		-halfCenter,
		SHEET_EXTENTS.yMin,
		halfCenter,
		SHEET_EXTENTS.yMax,
		LINE_MARKINGS.center.color
	);

	// tee line (physical thickness)
	const teeY = yFromBottom(LINE_MARKINGS.tee.distanceFromBottom);
	const halfTee = LINE_MARKINGS.tee.thickness / 2;
	drawRectangle(
		xMin,
		teeY - halfTee,
		xMax,
		teeY + halfTee,
		LINE_MARKINGS.tee.color
	);

	// hog lines with physical thickness
	const hogBottomNear = yFromBottom(LINE_MARKINGS.hog.distanceFromBottom);
	const hogTopNear = hogBottomNear - LINE_MARKINGS.hog.thickness;
	drawRectangle(xMin, hogTopNear, xMax, hogBottomNear, LINE_MARKINGS.hog.color);

	const hogBottomFar = yFromTop(LINE_MARKINGS.hog.distanceFromBottom);
	const hogTopFar = hogBottomFar + LINE_MARKINGS.hog.thickness;
	drawRectangle(xMin, hogBottomFar, xMax, hogTopFar, LINE_MARKINGS.hog.color);

	// back line centered around its measurement
	const backCenter = BACK_LINE_Y;
	const halfBack = LINE_MARKINGS.back.thickness / 2;
	drawRectangle(
		xMin,
		backCenter - halfBack,
		xMax,
		backCenter + halfBack,
		LINE_MARKINGS.back.color
	);
}


function drawHouse() {
	drawCircle(0, 0, MEASUREMENTS.rings.redOuter, '#1e88e5');
	drawCircle(0, 0, MEASUREMENTS.rings.redInner, '#d8efff');
	drawCircle(0, 0, MEASUREMENTS.rings.blueOuter, '#2e7d32');
	drawCircle(0, 0, MEASUREMENTS.rings.blueInner, '#d8efff');
}

function drawHacks() {
	const halfSpacing = MEASUREMENTS.hackSpacing / 2;
	const nearCenter = SHEET_EXTENTS.yMin + MEASUREMENTS.hackCenterOffset;
	const halfLength = MEASUREMENTS.hackLength / 2;

	drawHackPair(halfSpacing, nearCenter - halfLength, nearCenter + halfLength);
}

function drawHogLineSponsors() {
	if (!ctx) {
		return;
	}
	const nearY = HOG_LINE_NEAR_Y - (LINE_MARKINGS.hog.thickness / 2) - HOG_SPONSOR_OFFSET_Y;
	drawSponsorImage(hogLineRightImage, SHEET_EXTENTS.xMax - HOG_SPONSOR_MARGIN_X, nearY);
	const farY = HOG_LINE_FAR_Y + (LINE_MARKINGS.hog.thickness / 2) + HOG_SPONSOR_OFFSET_Y;
	const midY = (nearY + farY) / 2;
	const leftNearOffset = (midY - nearY) * 0.5;
	drawSponsorImage(
		hogLineLeftImage,
		SHEET_EXTENTS.xMin + HOG_SPONSOR_MARGIN_X,
		nearY - leftNearOffset
	);
	drawSponsorImage(hogLineMidRightImage, SHEET_EXTENTS.xMax - HOG_SPONSOR_MARGIN_X, midY);
	const leftMidOffset = (farY - midY) * 0.5;
	drawSponsorImage(
		hogLineMidLeftImage,
		SHEET_EXTENTS.xMin + HOG_SPONSOR_MARGIN_X,
		midY - leftMidOffset
	);
	drawSponsorImage(hogLineFarRightImage, SHEET_EXTENTS.xMax - HOG_SPONSOR_MARGIN_X, farY);
	const leftFarOffset = (farY - midY) * 0.5;
	drawSponsorImage(
		hogLineFarLeftImage,
		SHEET_EXTENTS.xMin + HOG_SPONSOR_MARGIN_X,
		farY - leftFarOffset
	);
}

function drawDragGuides() {
	if (!ctx || !dragState) {
		return;
	}
	const { stone, startWorld, currentWorld, pullbackMeters } = dragState;
	if (!stone || !startWorld || !currentWorld) {
		return;
	}
	const startCanvas = worldToCanvas(startWorld.x, startWorld.y);
	const dragCanvas = worldToCanvas(currentWorld.x, currentWorld.y);
	const radiusPx = Math.max(STONE_RADIUS * displayScale, 3);

	ctx.save();
	ctx.globalAlpha = 0.35;
	ctx.strokeStyle = '#0d47a1';
	ctx.lineWidth = Math.max(1, radiusPx * 0.12);
	ctx.beginPath();
	ctx.arc(startCanvas.x, startCanvas.y, radiusPx, 0, Math.PI * 2);
	ctx.stroke();
	ctx.restore();

	if (!pullbackMeters || pullbackMeters <= 0) {
		return;
	}

	const dirX = startWorld.x - currentWorld.x;
	const dirY = startWorld.y - currentWorld.y;
	const dirLength = Math.hypot(dirX, dirY);
	if (dirLength <= 0) {
		return;
	}
	const normX = dirX / dirLength;
	const normY = dirY / dirLength;
	const lineLengthWorld = (canvas.height / displayScale) * 2;
	const lineEndWorld = {
		x: currentWorld.x + normX * lineLengthWorld,
		y: currentWorld.y + normY * lineLengthWorld
	};
	const lineEndCanvas = worldToCanvas(lineEndWorld.x, lineEndWorld.y);

	ctx.save();
	ctx.strokeStyle = 'rgba(13, 71, 161, 0.5)';
	ctx.lineWidth = Math.max(1, radiusPx * 0.08);
	ctx.beginPath();
	ctx.moveTo(dragCanvas.x, dragCanvas.y);
	ctx.lineTo(lineEndCanvas.x, lineEndCanvas.y);
	ctx.stroke();
	ctx.restore();
}

function drawArrow(fromX, fromY, toX, toY) {
	const headLength = 12;
	const angle = Math.atan2(toY - fromY, toX - fromX);
	ctx.beginPath();
	ctx.moveTo(fromX, fromY);
	ctx.lineTo(toX, toY);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(toX, toY);
	ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
	ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
	ctx.closePath();
	ctx.fill();
}

function getTrayCenter(configs) {
	if (!configs || configs.length === 0) {
		return { x: 0, y: 0 };
	}
	const total = configs.reduce(
		(acc, config) => ({
			x: acc.x + config.position.x,
			y: acc.y + config.position.y
		}),
		{ x: 0, y: 0 }
	);
	return { x: total.x / configs.length, y: total.y / configs.length };
}

function getTrayTopCenter(configs) {
	if (!configs || configs.length === 0) {
		return { x: 0, y: 0 };
	}
	let minX = configs[0].position.x;
	let maxX = configs[0].position.x;
	let maxY = configs[0].position.y;
	for (const config of configs) {
		minX = Math.min(minX, config.position.x);
		maxX = Math.max(maxX, config.position.x);
		maxY = Math.max(maxY, config.position.y);
	}
	return { x: (minX + maxX) / 2, y: maxY };
}

function drawTutorialOverlay() {
	if (!ctx || !canvas || currentMode !== GameMode.TUTORIAL) {
		return;
	}
	ctx.save();
	ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
	ctx.strokeStyle = '#000';
	ctx.lineWidth = 4;
	ctx.font = "24px 'Comic Neue', 'Segoe UI', Tahoma, sans-serif";
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	if (tutorialStep === 0) {
		const hackCanvas = worldToCanvas(0, NEAR_HACK_TOP);
		const textX = canvas.width / 2;
		const textY = Math.max(80, hackCanvas.y - 120);
		ctx.fillText('This is the hack, from here stones are launched', textX, textY);
		ctx.fillStyle = '#000';
		drawArrow(textX, textY + 20, hackCanvas.x, hackCanvas.y);
	} else if (tutorialStep === 1) {
		const textX = canvas.width / 2;
		const textY = 90;
		ctx.fillText('These are the stones, that are left to throw', textX, textY);
		ctx.fillStyle = '#000';
		const redTop = getTrayTopCenter(redStoneConfigs);
		const yellowTop = getTrayTopCenter(yellowStoneConfigs);
		const redTarget = worldToCanvas(redTop.x, redTop.y);
		const yellowTarget = worldToCanvas(yellowTop.x, yellowTop.y);
		drawArrow(textX - 120, textY + 20, redTarget.x, redTarget.y);
		drawArrow(textX + 120, textY + 20, yellowTarget.x, yellowTarget.y);
	} else if (tutorialStep === 2) {
		const textX = canvas.width / 2;
		const textY = 90;
		ctx.fillText('Pull back on the stone to set the angle and speed.', textX, textY);
		ctx.fillText('Let go to throw it', textX, textY + 30);
		const startWorld = { x: 0, y: LAUNCH_START_Y };
		const downMeters = 6 * FEET_TO_METERS;
		const rightMeters = 2 * FEET_TO_METERS;
		const leftMeters = 3 * FEET_TO_METERS;
		const downDuration = 1200;
		const pauseDownDuration = 1000;
		const rightDuration = 600;
		const pauseRightDuration = 1000;
		const leftDuration = 900;
		const endPauseDuration = 1000;
		const cycleDuration =
			downDuration + pauseDownDuration + rightDuration + pauseRightDuration + leftDuration + endPauseDuration;
		const startTime = tutorialDemoStart ?? tutorialDemoTime;
		const elapsed = startTime ? (tutorialDemoTime - startTime) : 0;
		const t = elapsed % cycleDuration;
		let downProgress = 0;
		let rightProgress = 0;
		let leftProgress = 0;
		if (t < downDuration) {
			downProgress = t / downDuration;
		} else if (t < downDuration + pauseDownDuration) {
			downProgress = 1;
		} else if (t < downDuration + pauseDownDuration + rightDuration) {
			downProgress = 1;
			rightProgress = (t - downDuration - pauseDownDuration) / rightDuration;
		} else if (t < downDuration + pauseDownDuration + rightDuration + pauseRightDuration) {
			downProgress = 1;
			rightProgress = 1;
		} else if (t < downDuration + pauseDownDuration + rightDuration + pauseRightDuration + leftDuration) {
			downProgress = 1;
			rightProgress = 1;
			leftProgress =
				(t - downDuration - pauseDownDuration - rightDuration - pauseRightDuration) /
				leftDuration;
		} else {
			downProgress = 1;
			rightProgress = 1;
			leftProgress = 1;
		}
		const currentWorld = {
			x: (rightMeters * rightProgress) - (leftMeters * leftProgress),
			y: LAUNCH_START_Y - (downMeters * downProgress)
		};
		const dragVector = {
			x: currentWorld.x - startWorld.x,
			y: currentWorld.y - startWorld.y
		};
		const pullbackMeters = Math.hypot(dragVector.x, dragVector.y);
		const demoStone = {
			position: { ...currentWorld },
			color: StoneColor.RED,
			angle: 0
		};
		const previousDragState = dragState;
		dragState = {
			stone: demoStone,
			startWorld,
			currentWorld,
			pullbackMeters,
			dragVector
		};
		drawDragGuides();
		drawStone(demoStone);
		drawThrowSpeedOverlay();
		dragState = previousDragState;
	} else if (tutorialStep === 3) {
		const textX = canvas.width / 2;
		const textY = 200;
		ctx.fillText('Swipe to add rotation before the hog line', textX, textY);
		ctx.fillText('Faster swipe = faster rotation', textX, textY + 30);
		const endY = HOG_LINE_NEAR_Y - (3 * FEET_TO_METERS);
		const startWorld = { x: 0, y: endY - (21 * FEET_TO_METERS) };
		const swipeDuration = 500;
		const swipePauseDuration = 1000;
		const swipeCount = 3;
		const cycleDuration = (swipeDuration + swipePauseDuration) * swipeCount;
		const startTime = tutorialDemoStart ?? tutorialDemoTime;
		const elapsed = startTime ? (tutorialDemoTime - startTime) : 0;
		const t = elapsed % cycleDuration;
		const swipeStep = swipeDuration + swipePauseDuration;
		const swipeIndex = Math.floor(t / swipeStep);
		const swipeTime = t - (swipeIndex * swipeStep);
		const swipeProgress = swipeTime < swipeDuration ? swipeTime / swipeDuration : 1;
		const stoneRise = endY - startWorld.y;
		const stoneProgress = t / cycleDuration;
		const currentWorld = {
			x: 0,
			y: startWorld.y + (stoneRise * stoneProgress)
		};
		const demoStone = {
			position: { ...currentWorld },
			color: StoneColor.RED,
			angle: stoneProgress * Math.PI * 0.5
		};
		drawStone(demoStone);
		const swipeSpan = 4 * FEET_TO_METERS;
		const swipeX = (swipeProgress - 0.5) * swipeSpan;
		const swipeY = currentWorld.y + (1.2 * FEET_TO_METERS);
		const swipeCanvas = worldToCanvas(swipeX, swipeY);
		ctx.save();
		ctx.globalAlpha = 0.5;
		ctx.fillStyle = '#fff';
		ctx.beginPath();
		ctx.arc(swipeCanvas.x, swipeCanvas.y, Math.max(12, STONE_RADIUS * displayScale * 0.6), 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	ctx.restore();
}

function drawSponsorImage(image, centerX, centerY) {
	if (!ctx || !image || !image.complete || !image.naturalWidth || !image.naturalHeight) {
		return;
	}
	const widthMeters = HOG_SPONSOR_WIDTH * HOG_SPONSOR_SCALE;
	const referenceAspect = HOG_SPONSOR_PIXEL_HEIGHT / image.naturalWidth;
	const heightMeters = widthMeters * referenceAspect;
	const topLeft = worldToCanvas(centerX - widthMeters / 2, centerY + heightMeters / 2);
	const bottomRight = worldToCanvas(centerX + widthMeters / 2, centerY - heightMeters / 2);
	const widthPx = bottomRight.x - topLeft.x;
	const heightPx = bottomRight.y - topLeft.y;
	if (widthPx === 0 || heightPx === 0) {
		return;
	}
	ctx.save();
	ctx.globalAlpha = 0.5;
	ctx.drawImage(image, topLeft.x, topLeft.y, widthPx, heightPx);
	ctx.restore();
}

function drawHackPair(halfSpacing, yStart, yEnd) {
	drawRectangle(
		-(halfSpacing + MEASUREMENTS.hackWidth),
		yStart,
		-halfSpacing,
		yEnd,
		'#5d4037'
	);

	drawRectangle(
		halfSpacing,
		yStart,
		halfSpacing + MEASUREMENTS.hackWidth,
		yEnd,
		'#5d4037'
	);
}

function drawStones() {
	const stones = physicsEngine.getStones();
	for (const stone of stones) {
		drawStone(stone);
	}
}

function handleStoneStopped(stone) {
	if (stone && stone === cameraFollowStone) {
		cameraFollowStone = null;
	}
	if (stone && getStoneKey(stone) === lastLaunchedStoneKey) {
		lastLaunchedStoneKey = null;
	}
	if (stone?.isOut && !stone?.hogTiming?.nearCrossedAt) {
		stopThinkingTimer();
	}
	if (sweepState) {
		sweepState = null;
		physicsEngine.clearSweepState?.();
	}
	nextReadyAllowedAt = performance.now() + 2000;
}

function handleHogNearCross() {
	stopThinkingTimer();
}

function drawStone(stone) {
	const center = worldToCanvas(stone.position.x, stone.position.y);
	const radiusPx = Math.max(STONE_RADIUS * displayScale, 3);
	const fill = stone.color === StoneColor.YELLOW ? '#fdd835' : '#c62828';
	const shellColor = '#787878';

	ctx.save();
	ctx.beginPath();
	ctx.fillStyle = shellColor;
	ctx.strokeStyle = '#1a1a1a';
	ctx.lineWidth = Math.max(1, radiusPx * 0.01);
	ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();

	const innerRadius = radiusPx * 0.7;
	ctx.beginPath();
	ctx.fillStyle = fill;
	ctx.arc(center.x, center.y, innerRadius, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();

	drawStoneHandle(center, radiusPx, innerRadius, stone.angle ?? 0);
}

function drawThrowSpeedOverlay() {
	if (!ctx || !canvas || !dragState) {
		return;
	}
	const speed = getThrowSpeed(dragState.pullbackMeters);
	const text = `Speed: ${speed.toFixed(2)}`;
	const offset = 1 * FEET_TO_METERS;
	const anchorWorld = {
		x: dragState.currentWorld.x,
		y: dragState.currentWorld.y + offset
	};
	const anchorCanvas = worldToCanvas(anchorWorld.x, anchorWorld.y);
	ctx.save();
	ctx.font = '32px Arial';
	ctx.fillStyle = 'rgba(13, 71, 161, 0.85)';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, anchorCanvas.x, anchorCanvas.y);
	ctx.restore();
}

function drawMiniMap() {
	if (!ctx || !canvas) {
		return;
	}
	const minimapActive =
		!minimapHidden &&
		(dragState ||
			(readyStoneKey && isEndInProgress && !scoringSequence && !physicsEngine.isRunning()));
	if (!minimapActive) {
		minimapBounds = null;
		return;
	}
	const worldXMin = SHEET_EXTENTS.xMin;
	const worldXMax = SHEET_EXTENTS.xMax;
	const worldYMin = MINIMAP_Y_MIN;
	const worldYMax = MINIMAP_Y_MAX;
	const worldWidth = worldXMax - worldXMin;
	const worldHeight = worldYMax - worldYMin;
	if (worldWidth <= 0 || worldHeight <= 0) {
		return;
	}

	const baseSize = Math.min(canvas.width, canvas.height) * MINIMAP_SCALE_FRACTION;
	const minimapWidth = baseSize;
	const minimapHeight = baseSize * (worldHeight / worldWidth);
	const scale = minimapWidth / worldWidth;
	const contentWidth = worldWidth * scale;
	const contentHeight = worldHeight * scale;
	const boxX = canvas.width - minimapWidth - MINIMAP_MARGIN_PX;
	const boxY = MINIMAP_MARGIN_PX;
	const mapX = boxX;
	const mapY = boxY;
	minimapBounds = {
		x: boxX,
		y: boxY,
		width: minimapWidth,
		height: minimapHeight
	};

	const worldToMiniMap = (x, y) => ({
		x: mapX + (x - worldXMin) * scale,
		y: mapY + (worldYMax - y) * scale
	});

	ctx.save();
	ctx.fillStyle = 'rgba(216, 239, 255, 0.8)';
	ctx.strokeStyle = 'rgba(13, 71, 161, 0.6)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.rect(boxX, boxY, minimapWidth, minimapHeight);
	ctx.fill();
	ctx.stroke();

	ctx.fillStyle = 'rgba(216, 239, 255, 0.9)';
	ctx.strokeStyle = 'rgba(143, 187, 224, 0.9)';
	ctx.beginPath();
	ctx.rect(mapX, mapY, contentWidth, contentHeight);
	ctx.fill();
	ctx.stroke();

	const houseCenter = worldToMiniMap(0, 0);
	const drawHouseRing = (radius, color) => {
		const radiusPx = radius * scale;
		ctx.beginPath();
		ctx.fillStyle = color;
		ctx.arc(houseCenter.x, houseCenter.y, radiusPx, 0, Math.PI * 2);
		ctx.fill();
	};
	if (0 >= worldYMin - MEASUREMENTS.rings.redOuter && 0 <= worldYMax + MEASUREMENTS.rings.redOuter) {
		drawHouseRing(MEASUREMENTS.rings.redOuter, '#1e88e5');
		drawHouseRing(MEASUREMENTS.rings.redInner, '#d8efff');
		drawHouseRing(MEASUREMENTS.rings.blueOuter, '#2e7d32');
		drawHouseRing(MEASUREMENTS.rings.blueInner, '#d8efff');
	}

	const stones = physicsEngine.getStones();
	for (const stone of stones) {
		if (stone.isOut) {
			continue;
		}
		if (stone.position.y < worldYMin || stone.position.y > worldYMax) {
			continue;
		}
		const center = worldToMiniMap(stone.position.x, stone.position.y);
		const radiusPx = STONE_RADIUS * scale;
		ctx.beginPath();
		ctx.fillStyle = stone.color === StoneColor.YELLOW ? '#fdd835' : '#c62828';
		ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.lineWidth = 1;
	ctx.strokeStyle = LINE_MARKINGS.hog.color;
	const hogLineLeft = worldToMiniMap(worldXMin, worldYMin);
	const hogLineRight = worldToMiniMap(worldXMax, worldYMin);
	ctx.beginPath();
	ctx.moveTo(hogLineLeft.x, hogLineLeft.y);
	ctx.lineTo(hogLineRight.x, hogLineRight.y);
	ctx.stroke();

	if (0 >= worldYMin && 0 <= worldYMax) {
		ctx.strokeStyle = LINE_MARKINGS.tee.color;
		const teeLeft = worldToMiniMap(worldXMin, 0);
		const teeRight = worldToMiniMap(worldXMax, 0);
		ctx.beginPath();
		ctx.moveTo(teeLeft.x, teeLeft.y);
		ctx.lineTo(teeRight.x, teeRight.y);
		ctx.stroke();
	}

	ctx.strokeStyle = LINE_MARKINGS.center.color;
	const centerTop = worldToMiniMap(0, worldYMax);
	const centerBottom = worldToMiniMap(0, worldYMin);
	ctx.beginPath();
	ctx.moveTo(centerTop.x, centerTop.y);
	ctx.lineTo(centerBottom.x, centerBottom.y);
	ctx.stroke();

	ctx.restore();
}

function isPointInMinimap(point) {
	if (!minimapBounds) {
		return false;
	}
	return (
		point.x >= minimapBounds.x &&
		point.x <= minimapBounds.x + minimapBounds.width &&
		point.y >= minimapBounds.y &&
		point.y <= minimapBounds.y + minimapBounds.height
	);
}

function setCameraToEndLineTop() {
	if (!canvas) {
		return;
	}
	cameraFollowStone = null;
	if (minimapPeekPreviousZoom == null) {
		minimapPeekPreviousZoom = camera.zoom;
	}
	const segmentHeight = BACK_LINE_Y - HOG_LINE_FAR_Y;
	const targetDisplayScale = segmentHeight > 0 ? (canvas.height / segmentHeight) : displayScale;
	const targetZoom = targetDisplayScale / baseScale;
	camera.zoom = clamp(targetZoom, MIN_ZOOM, maxZoom);
	updateDisplayScale();
	camera.y = (BACK_LINE_Y + HOG_LINE_FAR_Y) / 2;
	clampCameraPosition({ allowBeyondBottom: true, allowBeyondTop: true });
}

function setCameraToHackView() {
	if (!canvas) {
		return;
	}
	cameraFollowStone = null;
	camera.y = NEAR_HACK_CENTER;
	clampCameraPosition({ allowBeyondBottom: true });
}

function setCameraToHogPastView() {
	if (!canvas) {
		return;
	}
	cameraFollowStone = null;
	tutorialCameraTargetY = getCameraYForStoneFromTop(HOG_LINE_NEAR_Y, 3 * FEET_TO_METERS);
}

function getCameraYForStoneFromTop(stoneY, offsetFromTopMeters) {
	if (!canvas) {
		return stoneY;
	}
	const desiredScreenY = offsetFromTopMeters * displayScale;
	return stoneY + ((desiredScreenY - (canvas.height / 2)) / displayScale);
}

function setCameraToLaunchPosition() {
	if (minimapPeekPreviousZoom != null) {
		camera.zoom = minimapPeekPreviousZoom;
		minimapPeekPreviousZoom = null;
		updateDisplayScale();
	}
	camera.y = getCameraYForStone(LAUNCH_START_Y);
	clampCameraPosition({ allowBeyondBottom: true });
}

function getThrowSpeed(pullbackMeters) {
	const ratio = MAX_PULLBACK_METERS > 0
		? clamp(pullbackMeters / MAX_PULLBACK_METERS, 0, 1)
		: 0;
	const eased = Math.pow(ratio, 5);
	return MIN_THROW_SPEED + ((MAX_THROW_SPEED - MIN_THROW_SPEED) * eased);
}

function advanceTutorial() {
	tutorialStep += 1;
	if (tutorialStep === 1) {
		setCameraToHackView();
		tutorialCameraTargetY = null;
	}
	if (tutorialStep === 2) {
		cameraFollowStone = null;
		camera.y = LAUNCH_START_Y;
		clampCameraPosition({ allowBeyondBottom: true });
		tutorialDemoStart = performance.now();
		tutorialCameraTargetY = null;
	}
	if (tutorialStep === 3) {
		setCameraToHogPastView();
		tutorialDemoStart = performance.now();
	}
	resizeCanvas();
	if (tutorialStep >= 4) {
		tutorialStep = 0;
		tutorialDemoStart = null;
		tutorialDemoTime = 0;
		tutorialCameraTargetY = null;
		showMenu();
		return;
	}
}

function resetGameState() {
	currentEndIndex = 0;
	startingTeamColor = StoneColor.RED;
	isGameOver = false;
	endResultCommitted = false;
	pendingRoundAction = null;
	acknowledgePointerId = null;
	nextTeamColorPending = null;
	stopThinkingTimer();
	const baseScores = Array(BASE_ENDS).fill('');
	scoreboardState.teams.forEach((team) => {
		team.scores = [...baseScores];
		team.total = 0;
	});
	teamThinkTimeRemaining[StoneColor.RED] = TEAM_THINK_TIME_SECONDS;
	teamThinkTimeRemaining[StoneColor.YELLOW] = TEAM_THINK_TIME_SECONDS;
	timerDisplayColor = startingTeamColor;
	setActiveTeamColor(startingTeamColor);
	renderScoreboard();
	hideWinnerAnnouncement();
}

function getSweepStone() {
	const stone = cameraFollowStone ?? getStoneByKey(lastLaunchedStoneKey);
	if (!stone || !stone.isLaunched || stone.isOut) {
		return null;
	}
	if (stone.hogTiming?.nearCrossedAt == null) {
		return null;
	}
	if (stone.position.y < HOG_LINE_NEAR_Y || stone.position.y > 0) {
		return null;
	}
	return stone;
}

function beginSweep(pointerId, screenPoint) {
	if (dragState) {
		return false;
	}
	const stone = getSweepStone();
	if (!stone) {
		return false;
	}
	sweepState = {
		pointerId,
		lastPoint: { ...screenPoint },
		stoneKey: getStoneKey(stone),
		mode: null
	};
	return true;
}

function applySweepEffect(mode, stoneKey) {
	if (!mode || !stoneKey) {
		return;
	}
	const frictionMultiplier = Math.max(0, 1 - SWEEP_FRICTION_REDUCTION);
	const curlMultiplier = mode === 'horizontal'
		? 0
		: 1 + SWEEP_CURL_BOOST;
	physicsEngine.setSweepState?.({
		key: stoneKey,
		frictionMultiplier,
		curlMultiplier
	});
}

function updateSweep(screenPoint) {
	if (!sweepState) {
		return;
	}
	const dx = screenPoint.x - sweepState.lastPoint.x;
	const dy = screenPoint.y - sweepState.lastPoint.y;
	const distance = Math.hypot(dx, dy);
	if (distance < SWEEP_MIN_DISTANCE_PX) {
		return;
	}
	const absX = Math.abs(dx);
	const absY = Math.abs(dy);
	let mode = null;
	if (absX > absY * SWEEP_DIRECTION_RATIO) {
		mode = 'horizontal';
	} else if (absY > absX * SWEEP_DIRECTION_RATIO) {
		mode = 'vertical';
	}
	if (mode) {
		sweepState.mode = mode;
		applySweepEffect(mode, sweepState.stoneKey);
	}
	sweepState.lastPoint = { ...screenPoint };
}

function endSweep(pointerId) {
	if (!sweepState || sweepState.pointerId !== pointerId) {
		return;
	}
	sweepState = null;
	physicsEngine.clearSweepState?.();
}

// Draw a light gray handle that starts at the red circle and extends 80% of the diameter.
function drawStoneHandle(center, radiusPx, innerRadius, angle) {
	if (!ctx) {
		return;
	}

	const handleThicknessMeters = 2 * INCHES_TO_METERS;
	const handleThicknessPx = Math.max(handleThicknessMeters * displayScale, 1.5);
	const handleLength = (innerRadius * 2) * 0.5;
	const startOffset = -innerRadius*0.7;

	ctx.save();
	ctx.translate(center.x, center.y);
	ctx.rotate(angle);
	ctx.beginPath();
	ctx.moveTo(startOffset, 0);
	ctx.lineTo(startOffset + handleLength, 0);
	ctx.strokeStyle = '#dfe2e4';
	ctx.lineWidth = handleThicknessPx;
	ctx.lineCap = 'round';
	ctx.stroke();
	ctx.restore();
}

function drawRectangle(xMin, yMin, xMax, yMax, fillStyle, strokeStyle) {
	const topLeft = worldToCanvas(xMin, yMax);
	const bottomRight = worldToCanvas(xMax, yMin);
	const width = bottomRight.x - topLeft.x;
	const height = bottomRight.y - topLeft.y;

	ctx.save();
	ctx.beginPath();
	ctx.rect(topLeft.x, topLeft.y, width, height);

	if (fillStyle) {
		ctx.fillStyle = fillStyle;
		ctx.fill();
	}

	if (strokeStyle) {
		ctx.strokeStyle = strokeStyle;
		ctx.lineWidth = 2;
		ctx.stroke();
	}

	ctx.restore();
}

function drawCircle(x, y, radiusMeters, fillStyle) {
	const center = worldToCanvas(x, y);
	const radius = Math.max(radiusMeters * displayScale, 0.5);

	ctx.save();
	ctx.beginPath();
	ctx.fillStyle = fillStyle;
	ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function worldToCanvas(x, y) {
	return {
		x: canvas.width / 2 + ((x - camera.x) * displayScale),
		y: canvas.height / 2 - ((y - camera.y) * displayScale)
	};
}

function screenToWorld(screenX, screenY) {
	return {
		x: camera.x + ((screenX - canvas.width / 2) / displayScale),
		y: camera.y - ((screenY - canvas.height / 2) / displayScale)
	};
}

function getCameraYForStone(stoneY, fractionFromBottom = STONE_SCREEN_FRACTION_FROM_BOTTOM) {
	if (!canvas) {
		return stoneY;
	}
	const desiredScreenY = canvas.height * (1 - fractionFromBottom);
	return stoneY + ((desiredScreenY - (canvas.height / 2)) / displayScale);
}

function getCameraYForLaunch(stoneY) {
	if (!canvas) {
		return stoneY;
	}
	const desired = getCameraYForStone(stoneY);
	const margin = MAX_PULLBACK_METERS + FEET_TO_METERS;
	const halfWorldHeight = canvas.height / (2 * displayScale);
	const limit = stoneY - margin + halfWorldHeight;
	return Math.min(desired, limit);
}


function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function clampCameraPosition({ allowBeyondBottom = false, allowBeyondTop = false } = {}) {
	if (!canvas) {
		return;
	}

	centerCameraHorizontal();

	const halfWorldHeight = canvas.height / (2 * displayScale);
	const minY = SHEET_EXTENTS.yMin + halfWorldHeight;
	const maxY = SHEET_EXTENTS.yMax - halfWorldHeight;
	if (minY <= maxY) {
		const lowerBound = allowBeyondBottom ? camera.y : minY;
		camera.y = clamp(camera.y, lowerBound, maxY);
	}

	if (!allowBeyondTop) {
		camera.y = Math.min(camera.y, 0);
	}
}

function centerCameraHorizontal() {
	if (!canvas) {
		camera.x = CAMERA_CENTER_X;
		return;
	}
	const halfWorldWidth = canvas.width / (2 * displayScale);
	const minCenter = SHEET_EXTENTS.xMin - SIDE_BUFFER_METERS + halfWorldWidth;
	const maxCenter = SHEET_EXTENTS.xMax + SIDE_BUFFER_METERS - halfWorldWidth;
	camera.x = minCenter > maxCenter ? CAMERA_CENTER_X : clamp(CAMERA_CENTER_X, minCenter, maxCenter);
}

function setCameraFollowStone(stone, { instant = false } = {}) {
	cameraFollowStone = stone ?? null;
	if (instant && cameraFollowStone) {
		updateCameraFollow(true);
	}
}

function updateCameraFollow(forceImmediate = false) {
	if (!cameraFollowStone) {
		return;
	}
	if (menuVisible) {
		return;
	}
	if (currentMode === GameMode.TUTORIAL) {
		return;
	}
	if (!cameraFollowStone.isLaunched || cameraFollowStone.isOut) {
		cameraFollowStone = null;
		return;
	}
	const targetY = getCameraYForStone(cameraFollowStone.position.y);
	const lerp = forceImmediate ? 1 : CAMERA_FOLLOW_LERP;
	camera.y = camera.y + (targetY - camera.y) * lerp;
	clampCameraPosition({ allowBeyondBottom: true });
}

function getCanvasRelativePosition(evt) {
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	const scaleY = canvas.height / rect.height;
	return {
		x: (evt.clientX - rect.left) * scaleX,
		y: (evt.clientY - rect.top) * scaleY
	};
}

function onPointerDown(evt) {
	if (menuVisible) {
		return;
	}
	if (currentMode === GameMode.TUTORIAL) {
		advanceTutorial();
		return;
	}
	if (pendingRoundAction) {
		acknowledgePointerId = evt.pointerId;
		canvas.setPointerCapture?.(evt.pointerId);
		return;
	}
	if (minimapHidden) {
		minimapHidden = false;
		setCameraToLaunchPosition();
		return;
	}
	const screenPoint = getCanvasRelativePosition(evt);
	if (minimapBounds && isPointInMinimap(screenPoint)) {
		minimapHidden = true;
		setCameraToEndLineTop();
		return;
	}
	if (dragState) {
		return;
	}
	if (evt.pointerType === 'mouse') {
		if (evt.button !== 0) {
			return;
		}
		if (beginSweep(evt.pointerId, screenPoint)) {
			canvas.setPointerCapture?.(evt.pointerId);
			return;
		}
		if (beginStoneDrag(evt.pointerId, screenPoint)) {
			canvas.setPointerCapture?.(evt.pointerId);
			return;
		}
		if (beginRotationSwipe(evt.pointerId, screenPoint)) {
			canvas.setPointerCapture?.(evt.pointerId);
			return;
		}
		return;
	}

	if (evt.pointerType === 'touch') {
		evt.preventDefault();
		if (beginSweep(evt.pointerId, screenPoint)) {
			canvas.setPointerCapture?.(evt.pointerId);
			return;
		}
		if (beginStoneDrag(evt.pointerId, screenPoint)) {
			canvas.setPointerCapture?.(evt.pointerId);
			return;
		}
		if (beginRotationSwipe(evt.pointerId, screenPoint)) {
			canvas.setPointerCapture?.(evt.pointerId);
			return;
		}
	}
}

function onPointerMove(evt) {
	if (dragState && dragState.pointerId === evt.pointerId) {
		if (evt.pointerType === 'touch') {
			evt.preventDefault();
		}
		updateStoneDrag(getCanvasRelativePosition(evt));
		return;
	}
	if (sweepState && sweepState.pointerId === evt.pointerId) {
		if (evt.pointerType === 'touch') {
			evt.preventDefault();
		}
		updateSweep(getCanvasRelativePosition(evt));
		return;
	}

}

function onPointerUp(evt) {
	if (currentMode === GameMode.TUTORIAL) {
		return;
	}
	if (pendingRoundAction && acknowledgePointerId === evt.pointerId) {
		acknowledgePointerId = null;
		canvas.releasePointerCapture?.(evt.pointerId);
		setScoreboardVisible(false);
		hideEndScoreAnnouncement();
		if (pendingRoundAction === 'nextEnd') {
			startNewEnd(startingTeamColor);
			return;
		}
		if (pendingRoundAction === 'newGame') {
			resetGameState();
			startNewEnd(startingTeamColor);
			return;
		}
	}
	if (sweepState && sweepState.pointerId === evt.pointerId) {
		endSweep(evt.pointerId);
		canvas.releasePointerCapture?.(evt.pointerId);
		return;
	}
	if (dragState && dragState.pointerId === evt.pointerId) {
		finishStoneDrag();
		canvas.releasePointerCapture?.(evt.pointerId);
		return;
	}
	if (swipeState && swipeState.pointerId === evt.pointerId) {
		finishRotationSwipe(evt.pointerId, getCanvasRelativePosition(evt));
		canvas.releasePointerCapture?.(evt.pointerId);
		return;
	}

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
	if (!isEndInProgress || isGameOver || scoringSequence || physicsEngine.isRunning() || dragState) {
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

function canStartDrag() {
	return isEndInProgress && !isGameOver && !scoringSequence && !physicsEngine.isRunning();
}

function isPointOnStone(pointWorld, stone) {
	const dx = pointWorld.x - stone.position.x;
	const dy = pointWorld.y - stone.position.y;
	return Math.hypot(dx, dy) <= STONE_RADIUS * 1.3;
}

function beginStoneDrag(pointerId, screenPoint) {
	if (!canStartDrag()) {
		return false;
	}
	const stone = getStoneByKey(readyStoneKey);
	if (!isStoneAvailable(stone)) {
		return false;
	}
	const pointWorld = screenToWorld(screenPoint.x, screenPoint.y);
	if (!isPointOnStone(pointWorld, stone)) {
		return false;
	}
	const startWorld = { x: 0, y: LAUNCH_START_Y };
	resetStoneForLaunch(stone, startWorld);
	dragState = {
		stone,
		pointerId,
		startWorld,
		startScreen: worldToCanvas(startWorld.x, startWorld.y),
		currentWorld: { ...startWorld },
		pullbackMeters: 0,
		dragVector: { x: 0, y: 0 }
	};
	cameraFollowStone = null;
	camera.y = getCameraYForLaunch(startWorld.y);
	clampCameraPosition({ allowBeyondBottom: true });
	return true;
}

function getRotationSwipeStone() {
	const stone = cameraFollowStone ?? getStoneByKey(lastLaunchedStoneKey);
	if (!stone || !stone.isLaunched || stone.isOut) {
		return null;
	}
	if (stone.hogTiming?.nearCrossedAt != null) {
		return null;
	}
	if (stone.position.y >= HOG_LINE_NEAR_Y) {
		return null;
	}
	return stone;
}

function beginRotationSwipe(pointerId, screenPoint) {
	const stone = getRotationSwipeStone();
	if (!stone) {
		return false;
	}
	swipeState = {
		pointerId,
		startScreen: { ...screenPoint },
		startTime: performance.now(),
		stoneKey: getStoneKey(stone)
	};
	return true;
}

function finishRotationSwipe(pointerId, screenPoint) {
	if (!swipeState || swipeState.pointerId !== pointerId) {
		return;
	}
	const stone = getStoneByKey(swipeState.stoneKey);
	const endTime = performance.now();
	const elapsedSeconds = (endTime - swipeState.startTime) / 1000;
	const dxScreen = screenPoint.x - swipeState.startScreen.x;
	const dxWorld = dxScreen / displayScale;
	const speedMetersPerSecond =
		elapsedSeconds > 0 ? Math.abs(dxWorld) / elapsedSeconds : 0;
	const referenceSpeed = ROTATION_SWIPE_REFERENCE_DISTANCE / ROTATION_SWIPE_REFERENCE_TIME;
	const normalized = referenceSpeed > 0 ? speedMetersPerSecond / referenceSpeed : 0;
	const rotationRate = Math.sign(dxWorld) * Math.min(MAX_ROTATION_RATE, normalized * MAX_ROTATION_RATE);
	const shouldApply =
		stone &&
		rotationRate !== 0 &&
		stone.isLaunched &&
		!stone.isOut &&
		stone.hogTiming?.nearCrossedAt == null &&
		stone.position.y < HOG_LINE_NEAR_Y;

	if (shouldApply) {
		stone.rotationRate = rotationRate;
		stone.pendingRotationRate = 0;
		stone.rotationActivated = true;
		stone.hasStoppedNotified = false;
	}

	swipeState = null;
}

function updateStoneDrag(screenPoint) {
	if (!dragState) {
		return;
	}
	const dxScreen = screenPoint.x - dragState.startScreen.x;
	const dyScreen = screenPoint.y - dragState.startScreen.y;

	if (dyScreen <= 0) {
		dragState.pullbackMeters = 0;
		dragState.dragVector = { x: 0, y: 0 };
		dragState.currentWorld = { ...dragState.startWorld };
		dragState.stone.position = { ...dragState.startWorld };
		return;
	}

	const rawVector = {
		x: dxScreen / displayScale,
		y: -dyScreen / displayScale
	};
	const rawLength = Math.hypot(rawVector.x, rawVector.y);
	const clampedLength = Math.min(rawLength, MAX_PULLBACK_METERS);
	const scale = rawLength > 0 ? clampedLength / rawLength : 0;
	const dragVector = {
		x: rawVector.x * scale,
		y: rawVector.y * scale
	};
	const currentWorld = {
		x: dragState.startWorld.x + dragVector.x,
		y: dragState.startWorld.y + dragVector.y
	};

	dragState.dragVector = dragVector;
	dragState.pullbackMeters = clampedLength;
	dragState.currentWorld = currentWorld;
	dragState.stone.position = { ...currentWorld };
}

function finishStoneDrag() {
	if (!dragState) {
		return;
	}
	const { stone, pullbackMeters, dragVector, startWorld } = dragState;
	dragState = null;

	if (!stone) {
		return;
	}

	resetStoneForLaunch(stone, startWorld);

	const speed = getThrowSpeed(pullbackMeters);
	const vectorLength = Math.hypot(dragVector.x, dragVector.y);
	const direction = vectorLength > 0
		? { x: -dragVector.x / vectorLength, y: -dragVector.y / vectorLength }
		: { x: 0, y: 1 };
	const velocity = {
		vx: direction.x * speed,
		vy: direction.y * speed
	};

	const launchedStone = physicsEngine.throwStone({
		color: stone.color,
		number: stone.number,
		velocity,
		rotationRadiansPerSecond: 0,
		offsetX: startWorld.x
	});
	if (launchSound) {
		launchSound.currentTime = 0;
		launchSound.play().catch(() => {});
	}
	camera.y = getCameraYForLaunch(startWorld.y);
	clampCameraPosition({ allowBeyondBottom: true });
	setCameraFollowStone(launchedStone, { instant: true });
	renderScoreboard();
	lastLaunchedStoneKey = getStoneKey(launchedStone);
	currentThrowIndex += 1;
	nextTeamColorPending = getColorForThrowIndex(currentThrowIndex);
	readyStoneKey = null;
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
canvas?.addEventListener('pointerdown', onPointerDown);
canvas?.addEventListener('pointermove', onPointerMove);
canvas?.addEventListener('pointerup', onPointerUp);
canvas?.addEventListener('pointercancel', onPointerUp);
canvas?.addEventListener('pointerleave', (evt) => {
	if (sweepState && sweepState.pointerId === evt.pointerId) {
		endSweep(evt.pointerId);
		return;
	}
	if (dragState && dragState.pointerId === evt.pointerId) {
		finishStoneDrag();
		return;
	}
	if (swipeState && swipeState.pointerId === evt.pointerId) {
		swipeState = null;
		return;
	}
});

function animationLoop(timestamp) {
	tutorialDemoTime = timestamp;
	if (currentMode === GameMode.TUTORIAL && tutorialCameraTargetY != null) {
		const delta = tutorialCameraTargetY - camera.y;
		camera.y += delta * 0.08;
		clampCameraPosition({ allowBeyondBottom: true });
		if (Math.abs(delta) < 0.02) {
			tutorialCameraTargetY = null;
		}
	}
	updateScoringSequence(timestamp);
	ensureReadyStone();
	updateThinkingTimer(timestamp);
	physicsEngine.update(timestamp);
	updateCameraFollow();
	maybeHandleEndCompletion();
	drawTrack();
	requestAnimationFrame(animationLoop);
}

resizeCanvas();
requestAnimationFrame(animationLoop);
