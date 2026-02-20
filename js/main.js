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
const STONE_WEIGHT = 42 * LBS_TO_KG;
const CURLING_STONE_DIAMETER = 11.5 * INCHES_TO_METERS;
const STONE_RADIUS = CURLING_STONE_DIAMETER / 2;
const STONE_TRAY_COLUMNS = 2;
const STONE_TRAY_ROWS = 4;
const STONE_TRAY_COLUMN_SPACING = STONE_RADIUS * 2.4;
const STONE_TRAY_ROW_SPACING = STONE_RADIUS * 2.4;
const STONE_TRAY_BOTTOM_MARGIN = STONE_RADIUS * 1.5;
const STONE_TRAY_SIDE_MARGIN = STONE_RADIUS * 1.2;

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
const FAR_TRAY_BASE_Y = SHEET_EXTENTS.yMax - STONE_TRAY_BOTTOM_MARGIN;
const redFarTrayBaseX = SHEET_EXTENTS.xMax - STONE_TRAY_SIDE_MARGIN;
const yellowFarTrayBaseX = SHEET_EXTENTS.xMin + STONE_TRAY_SIDE_MARGIN;
const HOG_SPONSOR_WIDTH = 6 * FEET_TO_METERS;
const HOG_SPONSOR_MARGIN_X = 1;
const HOG_SPONSOR_OFFSET_Y = -2;
const HOG_SPONSOR_PIXEL_HEIGHT = 720;
const HOG_SPONSOR_SCALE = 0.8;

const camera = {
	x: 0,
	y: 0,
	zoom: 0.1
};


const pointerState = new Map();
const multiTouchState = {
	lastPanPoint: null,
	lastPinchDistance: null,
	pinchAnchor: null
};
let wakeLockSentinel = null;

preventSystemZoom();
setupWakeLock();
registerServiceWorker();

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
	onStoneStopped: handleStoneStopped
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

function mountScoreboard() {
	scoreboardElement = createScoreboardElement();
	const attach = () => {
		if (!document.body.contains(scoreboardElement)) {
			document.body.appendChild(scoreboardElement);
		}
		renderScoreboard();
	};
	if (document.body) {
		attach();
	} else {
		window.addEventListener('DOMContentLoaded', attach, { once: true });
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

function setActiveTeamColor(color) {
	scoreboardState.activeTeamColor = color;
	renderScoreboard();
}

function resetStonesToHomeTrays() {
	const stones = physicsEngine.getStones();
	for (const stone of stones) {
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
		stone.pathSamples = [{ x: stone.position.x, y: stone.position.y }];
		stone.pathSampleTimer = 0;
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
	stone.pathSamples = [{ x: stone.position.x, y: stone.position.y }];
	stone.pathSampleTimer = 0;
}

function areAllThrowsCompleted() {
	return demoThrowSchedule.length > 0 && nextDemoThrowIndex >= demoThrowSchedule.length;
}

function hasMultipleColors(stones) {
	if (stones.length === 0) {
		return false;
	}
	const firstColor = stones[0].color;
	return stones.some((stone) => stone.color !== firstColor);
}

function maybeHandleEndCompletion() {
	if (!isEndInProgress || endResultCommitted || demoThrowSchedule.length === 0) {
		return;
	}
	if (!areAllThrowsCompleted()) {
		return;
	}
	if (physicsEngine.isRunning()) {
		return;
	}
	scoreCurrentEnd();
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
	startNextEndIfAvailable();
}

function clearDemoSchedule() {
	demoThrowSchedule = [];
	nextDemoThrowIndex = 0;
	demoAwaitingSettle = false;
}

function startNextEndIfAvailable() {
	if (isGameOver) {
		return;
	}
	const scheduledEnds = getTotalScheduledEnds();
	const totals = scoreboardState.teams.map((team) => team.total);
	const isTie = totals[0] === totals[1];
	if (currentEndIndex >= scheduledEnds) {
		if (isTie) {
			addExtraEndColumn();
			renderScoreboard();
			startNewEnd(startingTeamColor);
			return;
		}
		const winningTeam = totals[0] > totals[1] ? scoreboardState.teams[0] : scoreboardState.teams[1];
		concludeGame(winningTeam);
		return;
	}
	startNewEnd(startingTeamColor);
}

function startNewEnd(initialColor) {
	if (isGameOver) {
		return;
	}
	startingTeamColor = initialColor;
	ensureScoreCapacity(currentEndIndex);
	resetStonesToHomeTrays();
	setActiveTeamColor(startingTeamColor);
	launchDemoStones({ startingColor: startingTeamColor });
	isEndInProgress = true;
	endResultCommitted = false;
	hideWinnerAnnouncement();
}

function concludeGame(team) {
	isGameOver = true;
	isEndInProgress = false;
	clearDemoSchedule();
	const name = team?.name ?? 'Team';
	showWinnerAnnouncement(`${name} wins!`);
}

let baseScale = 1;
let displayScale = 1;
let widthFillScale = 1;
let maxZoom = 1;
const MIN_ZOOM = 0.5;
const CAMERA_FOLLOW_LERP = 0.18;
let isMousePanning = false;
let lastMousePoint = null;
let hasInitializedCameraView = false;
let cameraFollowStone = null;

function preventSystemZoom() {
	const blockWheelZoom = (event) => {
		if (event.ctrlKey || event.metaKey) {
			event.preventDefault();
		}
	};
	window.addEventListener('wheel', blockWheelZoom, { passive: false });
	const ZOOM_KEYS = new Set(['+', '=', '-', '_', '0']);
	window.addEventListener('keydown', (event) => {
		if ((event.ctrlKey || event.metaKey) && ZOOM_KEYS.has(event.key)) {
			event.preventDefault();
		}
	});
	['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
		try {
			document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
		} catch (error) {
			// Some browsers do not support gesture events; fail silently.
		}
	});
}

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

	if (!hasInitializedCameraView) {
		const desiredWidthFraction = canvas.width >= canvas.height ? 0.5 : 1;
		const desiredDisplayScale = (canvas.width * desiredWidthFraction) / horizontalSpan;
		const defaultZoom = desiredDisplayScale / baseScale;
		camera.zoom = clamp(defaultZoom, MIN_ZOOM, maxZoom);
		camera.x = CAMERA_CENTER_X;
		camera.y = (SHEET_EXTENTS.yMin + SHEET_EXTENTS.yMax) / 2;
		hasInitializedCameraView = true;
	} else {
		camera.zoom = clamp(camera.zoom, MIN_ZOOM, maxZoom);
	}
	updateDisplayScale();
	centerCameraHorizontal();
	clampCameraPosition();
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
	drawCurlPaths();
	drawStones();
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

function drawCurlPaths() {
	if (!ctx) {
		return;
	}
	const stones = physicsEngine.getStones();
	ctx.save();
	ctx.strokeStyle = 'rgba(138, 43, 226, 0.8)';
	ctx.lineWidth = Math.max(1, displayScale * 0.02);
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	for (const stone of stones) {
		const samples = stone.pathSamples;
		if (!samples || samples.length < 2) {
			continue;
		}
		ctx.beginPath();
		const start = worldToCanvas(samples[0].x, samples[0].y);
		ctx.moveTo(start.x, start.y);
		for (let i = 1; i < samples.length; i += 1) {
			const pt = worldToCanvas(samples[i].x, samples[i].y);
			ctx.lineTo(pt.x, pt.y);
		}
		ctx.stroke();
	}
	ctx.restore();
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
}

function drawStone(stone) {
	const center = worldToCanvas(stone.position.x, stone.position.y);
	const radiusPx = Math.max(STONE_RADIUS * displayScale, 3);
	const fill = stone.color === StoneColor.YELLOW ? '#fdd835' : '#c62828';
	const shellColor = '#424242';

	ctx.save();
	ctx.beginPath();
	ctx.fillStyle = shellColor;
	ctx.strokeStyle = '#1a1a1a';
	ctx.lineWidth = Math.max(1, radiusPx * 0.1);
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

function panByPixels(deltaX, deltaY) {
	if (!deltaY) {
		return;
	}

	camera.y += deltaY / displayScale;
	centerCameraHorizontal();
	clampCameraPosition();
	drawTrack();
}

function setZoom(targetZoom, anchorPoint) {
	const clamped = clamp(targetZoom, MIN_ZOOM, maxZoom);
	if (clamped === camera.zoom) {
		return;
	}

	const anchor = anchorPoint || { x: canvas.width / 2, y: canvas.height / 2 };
	const worldBefore = screenToWorld(anchor.x, anchor.y);
	camera.zoom = clamped;
	updateDisplayScale();
	camera.x = worldBefore.x - ((anchor.x - canvas.width / 2) / displayScale);
	camera.y = worldBefore.y + ((anchor.y - canvas.height / 2) / displayScale);
	centerCameraHorizontal();
	clampCameraPosition();
	drawTrack();
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function clampCameraPosition() {
	if (!canvas) {
		return;
	}

	centerCameraHorizontal();

	const halfWorldHeight = canvas.height / (2 * displayScale);
	const minY = SHEET_EXTENTS.yMin + halfWorldHeight;
	const maxY = SHEET_EXTENTS.yMax - halfWorldHeight;
	if (minY <= maxY) {
		camera.y = clamp(camera.y, minY, maxY);
	}

	camera.y = Math.min(camera.y, 0);
}

function centerCameraHorizontal() {
	camera.x = CAMERA_CENTER_X;
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
	if (!cameraFollowStone.isLaunched || cameraFollowStone.isOut) {
		cameraFollowStone = null;
		return;
	}
	const targetY = Math.min(cameraFollowStone.position.y, 0);
	const lerp = forceImmediate ? 1 : CAMERA_FOLLOW_LERP;
	camera.y = camera.y + (targetY - camera.y) * lerp;
	clampCameraPosition();
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

function onWheel(evt) {
	evt.preventDefault();
	const anchor = getCanvasRelativePosition(evt);
	const zoomFactor = Math.exp(-evt.deltaY * 0.0015);
	setZoom(camera.zoom * zoomFactor, anchor);
}

function onPointerDown(evt) {
	if (evt.pointerType === 'mouse') {
		if (evt.button !== 0) {
			return;
		}
		isMousePanning = true;
		lastMousePoint = { x: evt.clientX, y: evt.clientY };
		canvas.setPointerCapture?.(evt.pointerId);
		return;
	}

	if (evt.pointerType === 'touch') {
		evt.preventDefault();
		canvas.setPointerCapture?.(evt.pointerId);
		pointerState.set(evt.pointerId, getCanvasRelativePosition(evt));
		if (pointerState.size === 1) {
			multiTouchState.lastPanPoint = getCanvasRelativePosition(evt);
			multiTouchState.lastPinchDistance = null;
			multiTouchState.pinchAnchor = null;
		} else if (pointerState.size === 2) {
			multiTouchState.lastPinchDistance = getTouchDistance();
			multiTouchState.pinchAnchor = getTouchMidpoint();
		}
	}
}

function onPointerMove(evt) {
	if (evt.pointerType === 'mouse') {
		if (!isMousePanning || evt.buttons === 0) {
			return;
		}
		const dx = evt.clientX - lastMousePoint.x;
		const dy = evt.clientY - lastMousePoint.y;
		lastMousePoint = { x: evt.clientX, y: evt.clientY };
		panByPixels(dx, dy);
		return;
	}

	if (evt.pointerType === 'touch' && pointerState.has(evt.pointerId)) {
		evt.preventDefault();
		pointerState.set(evt.pointerId, getCanvasRelativePosition(evt));
		if (pointerState.size === 1) {
			const point = pointerState.values().next().value;
			if (multiTouchState.lastPanPoint) {
				const dx = point.x - multiTouchState.lastPanPoint.x;
				const dy = point.y - multiTouchState.lastPanPoint.y;
				panByPixels(dx, dy);
			}
			multiTouchState.lastPanPoint = { ...point };
			return;
		}

		if (pointerState.size >= 2) {
			const newMidpoint = getTouchMidpoint();
			if (multiTouchState.pinchAnchor) {
				const dx = newMidpoint.x - multiTouchState.pinchAnchor.x;
				const dy = newMidpoint.y - multiTouchState.pinchAnchor.y;
				panByPixels(dx, dy);
			}
			multiTouchState.pinchAnchor = { ...newMidpoint };

			const newDistance = getTouchDistance();
			if (multiTouchState.lastPinchDistance) {
				const scaleFactor = newDistance / multiTouchState.lastPinchDistance;
				setZoom(camera.zoom * scaleFactor, multiTouchState.pinchAnchor);
			}
			multiTouchState.lastPinchDistance = newDistance;
		}
	}
}

function onPointerUp(evt) {
	if (evt.pointerType === 'mouse') {
		if (evt.button !== 0) {
			return;
		}
		isMousePanning = false;
		lastMousePoint = null;
		canvas.releasePointerCapture?.(evt.pointerId);
		return;
	}

	if (evt.pointerType === 'touch' && pointerState.has(evt.pointerId)) {
		pointerState.delete(evt.pointerId);
		canvas.releasePointerCapture?.(evt.pointerId);
		if (pointerState.size === 1) {
			const remaining = pointerState.values().next().value;
			multiTouchState.lastPanPoint = { ...remaining };
			multiTouchState.lastPinchDistance = null;
			multiTouchState.pinchAnchor = null;
		} else if (pointerState.size >= 2) {
			multiTouchState.lastPinchDistance = getTouchDistance();
			multiTouchState.pinchAnchor = getTouchMidpoint();
		} else {
			multiTouchState.lastPanPoint = null;
			multiTouchState.lastPinchDistance = null;
			multiTouchState.pinchAnchor = null;
		}
	}
}

function getTouchDistance() {
	const pointers = Array.from(pointerState.values());
	if (pointers.length < 2) {
		return 0;
	}
	return distanceBetween(pointers[0], pointers[1]);
}

function getTouchMidpoint() {
	const pointers = Array.from(pointerState.values());
	if (pointers.length < 2) {
		return null;
	}
	return midpointBetween(pointers[0], pointers[1]);
}

function distanceBetween(a, b) {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.hypot(dx, dy);
}

function midpointBetween(a, b) {
	return {
		x: (a.x + b.x) / 2,
		y: (a.y + b.y) / 2
	};
}

let demoThrowSchedule = [];
let nextDemoThrowIndex = 0;
let demoAwaitingSettle = false;

function randomInRange(min, max) {
	return Math.random() * (max - min) + min;
}

function randomPointInsideCircle(radius) {
	const r = Math.sqrt(Math.random()) * radius;
	const theta = Math.random() * Math.PI * 2;
	return {
		x: r * Math.cos(theta),
		y: r * Math.sin(theta)
	};
}

function findStoneInstance(color, number) {
	return physicsEngine
		.getStones()
		.find((stone) => stone.color === color && stone.number === number);
}

function applyStaticStoneState(stone, position) {
	stone.position = { ...position };
	stone.velocity = { vx: 0, vy: 0 };
	stone.pendingRotationRate = 0;
	stone.rotationRate = 0;
	stone.rotationActivated = true;
	stone.angle = 0;
	stone.isLaunched = true;
	stone.isOut = false;
	stone.hasStoppedNotified = true;
	stone.pathSamples = [{ ...position }];
	stone.pathSampleTimer = 0;
}

function placeStoneRandomlyInHouse(stone, placedPositions) {
	const maxRadius = Math.max(HOUSE_RADIUS - STONE_RADIUS * 1.1, STONE_RADIUS);
	const minGap = STONE_RADIUS * 2 + 0.02;
	let gap = minGap;
	for (let attempt = 0; attempt < 500; attempt += 1) {
		const candidate = randomPointInsideCircle(maxRadius);
		const separated = placedPositions.every((pos) => Math.hypot(pos.x - candidate.x, pos.y - candidate.y) >= gap);
		if (separated) {
			applyStaticStoneState(stone, candidate);
			placedPositions.push(candidate);
			return true;
		}
		if ((attempt + 1) % 120 === 0) {
			gap = Math.max(STONE_RADIUS * 2, gap * 0.9);
		}
	}
	applyStaticStoneState(stone, { x: 0, y: 0 });
	placedPositions.push({ x: 0, y: 0 });
	return false;
}

function buildStoneOrder(startingColor) {
	const redQueue = redStoneConfigs.map((cfg) => cfg.number);
	const yellowQueue = yellowStoneConfigs.map((cfg) => cfg.number);
	const totalThrows = redQueue.length + yellowQueue.length;
	const order = [];
	let redIndex = 0;
	let yellowIndex = 0;
	let currentColor = startingColor;
	for (let i = 0; i < totalThrows; i += 1) {
		const color = currentColor;
		currentColor = currentColor === StoneColor.RED ? StoneColor.YELLOW : StoneColor.RED;
		const number = color === StoneColor.RED ? redQueue[redIndex++] : yellowQueue[yellowIndex++];
		order.push({ color, number });
	}
	return order;
}

function createDemoThrowPlan(entry, angleVariance) {
	const speed = randomInRange(2.4, 2.6);
	const angleOffset = randomInRange(-angleVariance, angleVariance);
	const rotationMagnitude = randomInRange(2, 3.2);
	const rotation =
		angleOffset < -0.005 ? rotationMagnitude : angleOffset > 0.005 ? -rotationMagnitude : 0;
	return {
		color: entry.color,
		number: entry.number,
		rotation,
		velocity: {
			vx: speed * Math.sin(angleOffset),
			vy: speed * Math.cos(angleOffset)
		}
	};
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

function launchDemoStones(options) {
	launchDemoStones1(options);
}

function launchDemoStones1({ angleVariance = 0.08, startingColor = StoneColor.RED } = {}) {
	const stoneOrder = buildStoneOrder(startingColor);
	demoThrowSchedule = stoneOrder.map((entry) => createDemoThrowPlan(entry, angleVariance));
	nextDemoThrowIndex = 0;
	demoAwaitingSettle = false;
}

function launchDemoStones2({ angleVariance = 0.08, startingColor = StoneColor.RED } = {}) {
	const stoneOrder = buildStoneOrder(startingColor);
	const placedPositions = [];
	const placementCount = Math.min(10, stoneOrder.length);
	const throws = [];

	for (let i = 0; i < stoneOrder.length; i += 1) {
		const entry = stoneOrder[i];
		if (i < placementCount) {
			const stone = findStoneInstance(entry.color, entry.number);
			if (!stone) {
				throws.push(createDemoThrowPlan(entry, angleVariance));
				continue;
			}
			placeStoneRandomlyInHouse(stone, placedPositions);
			continue;
		}
		throws.push(createDemoThrowPlan(entry, angleVariance));
	}

	demoThrowSchedule = throws;
	nextDemoThrowIndex = 0;
	demoAwaitingSettle = false;
}

function launchDemoStones3({ startingColor = StoneColor.RED } = {}) {
	const stoneOrder = buildStoneOrder(startingColor);
	if (stoneOrder.length === 0) {
		demoThrowSchedule = [];
		nextDemoThrowIndex = 0;
		demoAwaitingSettle = false;
		return;
	}

	const [centerEntry, ...restEntries] = stoneOrder;
	const centerStone = findStoneInstance(centerEntry.color, centerEntry.number);
	if (centerStone) {
		applyStaticStoneState(centerStone, { x: 0, y: 0 });
	}

	demoThrowSchedule = restEntries.map((entry) => ({
		color: entry.color,
		number: entry.number,
		rotation: 0,
		velocity: {
			vx: 0,
			vy: 3
		}
	}));
	nextDemoThrowIndex = 0;
	demoAwaitingSettle = false;
}

function processDemoThrows() {
	if (
		demoThrowSchedule.length === 0 ||
		nextDemoThrowIndex >= demoThrowSchedule.length
	) {
		return;
	}

	if (demoAwaitingSettle) {
		if (!physicsEngine.isRunning()) {
			demoAwaitingSettle = false;
		} else {
			return;
		}
	}

	if (physicsEngine.isRunning()) {
		return;
	}

	const plan = demoThrowSchedule[nextDemoThrowIndex++];
	setActiveTeamColor(plan.color);
	const launchedStone = physicsEngine.throwStone({
		color: plan.color,
		number: plan.number,
		velocity: plan.velocity,
		rotationRadiansPerSecond: plan.rotation
	});
	setCameraFollowStone(launchedStone, { instant: true });
	demoAwaitingSettle = true;
}

mountScoreboard();
mountWinnerAnnouncement();
startNewEnd(startingTeamColor);

window.addEventListener('resize', resizeCanvas, { passive: true });
canvas?.addEventListener('wheel', onWheel, { passive: false });
canvas?.addEventListener('pointerdown', onPointerDown);
canvas?.addEventListener('pointermove', onPointerMove);
canvas?.addEventListener('pointerup', onPointerUp);
canvas?.addEventListener('pointercancel', onPointerUp);
canvas?.addEventListener('pointerleave', (evt) => {
	if (evt.pointerType === 'mouse' && isMousePanning) {
		onPointerUp(evt);
	}
	if (evt.pointerType === 'touch' && pointerState.has(evt.pointerId)) {
		onPointerUp(evt);
	}
});

function animationLoop(timestamp) {
	processDemoThrows();
	physicsEngine.update(timestamp);
	updateCameraFollow();
	maybeHandleEndCompletion();
	drawTrack();
	requestAnimationFrame(animationLoop);
}

resizeCanvas();
requestAnimationFrame(animationLoop);
