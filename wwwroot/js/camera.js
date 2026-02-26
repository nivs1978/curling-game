const CAMERA_FOLLOW_LERP = 0.18;

export const camera = {
	x: 0,
	y: 0,
	zoom: 0.1
};

let canvas = null;
let sheetExtents = null;
let sideBufferMeters = 0;
let cameraCenterX = 0;
let stoneScreenFractionFromBottom = 0.3;
let maxPullbackMeters = 0;
let launchMarginMeters = 0;
let topClampY = 0;
let baseScale = 1;
let displayScale = 1;
let widthFillScale = 1;
let maxZoom = 1;
let minZoom = 0.5;
let cameraFollowStone = null;
let minimapPeekPreviousZoom = null;

export function configureCamera(config) {
	if (!config) {
		return;
	}
	if (config.canvas) {
		canvas = config.canvas;
	}
	if (config.sheetExtents) {
		sheetExtents = config.sheetExtents;
	}
	if (typeof config.sideBufferMeters === 'number') {
		sideBufferMeters = config.sideBufferMeters;
	}
	if (typeof config.cameraCenterX === 'number') {
		cameraCenterX = config.cameraCenterX;
	}
	if (typeof config.stoneScreenFractionFromBottom === 'number') {
		stoneScreenFractionFromBottom = config.stoneScreenFractionFromBottom;
	}
	if (typeof config.maxPullbackMeters === 'number') {
		maxPullbackMeters = config.maxPullbackMeters;
	}
	if (typeof config.launchMarginMeters === 'number') {
		launchMarginMeters = config.launchMarginMeters;
	}
	if (typeof config.topClampY === 'number') {
		topClampY = config.topClampY;
	}
	if (typeof config.minZoom === 'number') {
		minZoom = config.minZoom;
	}
}

export function setScaleData({ baseScale: newBaseScale, widthFillScale: newWidthFillScale, maxZoom: newMaxZoom }) {
	if (typeof newBaseScale === 'number') {
		baseScale = newBaseScale;
	}
	if (typeof newWidthFillScale === 'number') {
		widthFillScale = newWidthFillScale;
	}
	if (typeof newMaxZoom === 'number') {
		maxZoom = newMaxZoom;
	}
	updateDisplayScale();
}

export function setCameraZoom(zoom) {
	camera.zoom = clamp(zoom, minZoom, maxZoom);
	updateDisplayScale();
}

export function setMinZoom(zoom) {
	minZoom = zoom;
}

export function getDisplayScale() {
	return displayScale;
}

export function getBaseScale() {
	return baseScale;
}

export function getMaxZoom() {
	return maxZoom;
}

export function getWidthFillScale() {
	return widthFillScale;
}

export function updateDisplayScale() {
	displayScale = baseScale * camera.zoom;
}

export function worldToCanvas(x, y) {
	if (!canvas) {
		return { x: 0, y: 0 };
	}
	return {
		x: canvas.width / 2 + ((x - camera.x) * displayScale),
		y: canvas.height / 2 - ((y - camera.y) * displayScale)
	};
}

export function screenToWorld(screenX, screenY) {
	if (!canvas) {
		return { x: 0, y: 0 };
	}
	return {
		x: camera.x + ((screenX - canvas.width / 2) / displayScale),
		y: camera.y - ((screenY - canvas.height / 2) / displayScale)
	};
}

export function getCameraYForStoneFromTop(stoneY, offsetFromTopMeters) {
	if (!canvas) {
		return stoneY;
	}
	const desiredScreenY = offsetFromTopMeters * displayScale;
	return stoneY + ((desiredScreenY - (canvas.height / 2)) / displayScale);
}

export function getCameraYForStone(stoneY, fractionFromBottom = stoneScreenFractionFromBottom) {
	if (!canvas) {
		return stoneY;
	}
	const desiredScreenY = canvas.height * (1 - fractionFromBottom);
	return stoneY + ((desiredScreenY - (canvas.height / 2)) / displayScale);
}

export function getCameraYForLaunch(stoneY) {
	if (!canvas) {
		return stoneY;
	}
	const desired = getCameraYForStone(stoneY);
	const margin = launchMarginMeters || maxPullbackMeters;
	const halfWorldHeight = canvas.height / (2 * displayScale);
	const limit = stoneY - margin + halfWorldHeight;
	return Math.min(desired, limit);
}

export function clampCameraPosition({ allowBeyondBottom = false, allowBeyondTop = false } = {}) {
	if (!canvas || !sheetExtents) {
		return;
	}

	centerCameraHorizontal();

	const halfWorldHeight = canvas.height / (2 * displayScale);
	const minY = sheetExtents.yMin + halfWorldHeight;
	const maxY = sheetExtents.yMax - halfWorldHeight;
	if (minY <= maxY) {
		const lowerBound = allowBeyondBottom ? camera.y : minY;
		camera.y = clamp(camera.y, lowerBound, maxY);
	}

	if (!allowBeyondTop) {
		camera.y = Math.min(camera.y, topClampY);
	}
}

export function centerCameraHorizontal() {
	if (!canvas || !sheetExtents) {
		camera.x = cameraCenterX;
		return;
	}
	const halfWorldWidth = canvas.width / (2 * displayScale);
	const minCenter = sheetExtents.xMin - sideBufferMeters + halfWorldWidth;
	const maxCenter = sheetExtents.xMax + sideBufferMeters - halfWorldWidth;
	camera.x = minCenter > maxCenter ? cameraCenterX : clamp(cameraCenterX, minCenter, maxCenter);
}

export function setCameraFollowStone(stone, { instant = false } = {}) {
	cameraFollowStone = stone ?? null;
	if (instant && cameraFollowStone) {
		updateCameraFollow(true);
	}
}

export function clearCameraFollowStone() {
	cameraFollowStone = null;
}

export function getCameraFollowStone() {
	return cameraFollowStone;
}

export function updateCameraFollow(forceImmediate = false) {
	if (!cameraFollowStone) {
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

export function setCameraToEndLineTop(backLineY, hogLineFarY) {
	if (!canvas) {
		return;
	}
	clearCameraFollowStone();
	if (minimapPeekPreviousZoom == null) {
		minimapPeekPreviousZoom = camera.zoom;
	}
	const segmentHeight = backLineY - hogLineFarY;
	const targetDisplayScale = segmentHeight > 0 ? (canvas.height / segmentHeight) : displayScale;
	const targetZoom = targetDisplayScale / baseScale;
	setCameraZoom(targetZoom);
	camera.y = (backLineY + hogLineFarY) / 2;
	clampCameraPosition({ allowBeyondBottom: true, allowBeyondTop: true });
}

export function setCameraToHackView(nearHackCenter) {
	if (!canvas) {
		return;
	}
	clearCameraFollowStone();
	camera.y = nearHackCenter;
	clampCameraPosition({ allowBeyondBottom: true });
}

export function setCameraToLaunchPosition(launchStartY) {
	if (minimapPeekPreviousZoom != null) {
		setCameraZoom(minimapPeekPreviousZoom);
		minimapPeekPreviousZoom = null;
	}
	camera.y = getCameraYForStone(launchStartY);
	clampCameraPosition({ allowBeyondBottom: true });
}

export function clearMinimapPeekZoom() {
	minimapPeekPreviousZoom = null;
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}
