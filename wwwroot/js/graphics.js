import { StoneColor } from './stone.js';
import { getDisplayScale, worldToCanvas } from './camera.js';

let canvas = null;
let ctx = null;
let minimapBounds = null;

export function configureGraphics({ canvasElement, context }) {
	canvas = canvasElement;
	ctx = context;
}

export function getMinimapBounds() {
	return minimapBounds;
}

export function isPointInMinimap(point) {
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

export function drawTrack(state) {
	if (!ctx || !canvas) {
		return;
	}
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	drawSheet(state);
	drawHouse(state);
	drawHacks(state);
	drawGuideLines(state);
	drawHogLineSponsors(state);
	drawDragGuides(state);
	drawStones(state);
	drawThrowSpeedOverlay(state);
	drawMiniMap(state);
	drawTutorialOverlay(state);
}

function drawSheet({ sheetExtents }) {
	drawRectangle(
		sheetExtents.xMin,
		sheetExtents.yMin,
		sheetExtents.xMax,
		sheetExtents.yMax,
		'#d8efff',
		'#8fbbe0'
	);
}

function drawGuideLines({ sheetExtents, lineMarkings, backLineY }) {
	const { xMin, xMax } = sheetExtents;

	const halfCenter = lineMarkings.center.thickness / 2;
	drawRectangle(
		-halfCenter,
		sheetExtents.yMin,
		halfCenter,
		sheetExtents.yMax,
		lineMarkings.center.color
	);

	const teeY = sheetExtents.yMin + lineMarkings.tee.distanceFromBottom;
	const halfTee = lineMarkings.tee.thickness / 2;
	drawRectangle(
		xMin,
		teeY - halfTee,
		xMax,
		teeY + halfTee,
		lineMarkings.tee.color
	);

	const hogBottomNear = sheetExtents.yMin + lineMarkings.hog.distanceFromBottom;
	const hogTopNear = hogBottomNear - lineMarkings.hog.thickness;
	drawRectangle(xMin, hogTopNear, xMax, hogBottomNear, lineMarkings.hog.color);

	const hogBottomFar = sheetExtents.yMax - lineMarkings.hog.distanceFromBottom;
	const hogTopFar = hogBottomFar + lineMarkings.hog.thickness;
	drawRectangle(xMin, hogBottomFar, xMax, hogTopFar, lineMarkings.hog.color);

	const backCenter = backLineY;
	const halfBack = lineMarkings.back.thickness / 2;
	drawRectangle(
		xMin,
		backCenter - halfBack,
		xMax,
		backCenter + halfBack,
		lineMarkings.back.color
	);
}

function drawHouse({ measurements }) {
	drawCircle(0, 0, measurements.rings.redOuter, '#1e88e5');
	drawCircle(0, 0, measurements.rings.redInner, '#d8efff');
	drawCircle(0, 0, measurements.rings.blueOuter, '#2e7d32');
	drawCircle(0, 0, measurements.rings.blueInner, '#d8efff');
}

function drawHacks({ measurements, sheetExtents }) {
	const halfSpacing = measurements.hackSpacing / 2;
	const nearCenter = sheetExtents.yMin + measurements.hackCenterOffset;
	const halfLength = measurements.hackLength / 2;

	drawHackPair(halfSpacing, nearCenter - halfLength, nearCenter + halfLength, measurements.hackWidth);
}

function drawHogLineSponsors({ sheetExtents, lineMarkings, hogSponsor, hogImages, hogLineNearY, hogLineFarY }) {
	const nearY = hogLineNearY - (lineMarkings.hog.thickness / 2) - hogSponsor.offsetY;
	drawSponsorImage(hogImages.right, sheetExtents.xMax - hogSponsor.marginX, nearY, hogSponsor);
	const farY = hogLineFarY + (lineMarkings.hog.thickness / 2) + hogSponsor.offsetY;
	const midY = (nearY + farY) / 2;
	const leftNearOffset = (midY - nearY) * 0.5;
	drawSponsorImage(
		hogImages.left,
		sheetExtents.xMin + hogSponsor.marginX,
		nearY - leftNearOffset,
		hogSponsor
	);
	drawSponsorImage(hogImages.midRight, sheetExtents.xMax - hogSponsor.marginX, midY, hogSponsor);
	const leftMidOffset = (farY - midY) * 0.5;
	drawSponsorImage(
		hogImages.midLeft,
		sheetExtents.xMin + hogSponsor.marginX,
		midY - leftMidOffset,
		hogSponsor
	);
	drawSponsorImage(hogImages.farRight, sheetExtents.xMax - hogSponsor.marginX, farY, hogSponsor);
	const leftFarOffset = (farY - midY) * 0.5;
	drawSponsorImage(
		hogImages.farLeft,
		sheetExtents.xMin + hogSponsor.marginX,
		farY - leftFarOffset,
		hogSponsor
	);
}

function drawDragGuides({ dragState, stoneRadius }) {
	if (!dragState) {
		return;
	}
	const { stone, startWorld, currentWorld, pullbackMeters } = dragState;
	if (!stone || !startWorld || !currentWorld) {
		return;
	}
	const displayScale = getDisplayScale();
	const startCanvas = worldToCanvas(startWorld.x, startWorld.y);
	const dragCanvas = worldToCanvas(currentWorld.x, currentWorld.y);
	const radiusPx = Math.max(stoneRadius * displayScale, 3);

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

function drawTutorialOverlay({ tutorial }) {
	if (!tutorial || tutorial.currentMode !== tutorial.tutorialMode) {
		return;
	}
	ctx.save();
	ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
	ctx.strokeStyle = '#000';
	ctx.lineWidth = 4;
	ctx.font = "24px 'Comic Neue', 'Segoe UI', Tahoma, sans-serif";
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	if (tutorial.step === 0) {
		const hackCanvas = worldToCanvas(0, tutorial.nearHackTop);
		const textX = canvas.width / 2;
		const textY = Math.max(80, hackCanvas.y - 120);
		ctx.fillText('This is the hack, from here stones are launched', textX, textY);
		ctx.fillStyle = '#000';
		drawArrow(textX, textY + 20, hackCanvas.x, hackCanvas.y);
	} else if (tutorial.step === 1) {
		const textX = canvas.width / 2;
		const textY = 90;
		ctx.fillText('These are the stones, that are left to throw', textX, textY);
		ctx.fillStyle = '#000';
		const redTop = getTrayTopCenter(tutorial.redStoneConfigs);
		const yellowTop = getTrayTopCenter(tutorial.yellowStoneConfigs);
		const redTarget = worldToCanvas(redTop.x, redTop.y);
		const yellowTarget = worldToCanvas(yellowTop.x, yellowTop.y);
		drawArrow(textX - 120, textY + 20, redTarget.x, redTarget.y);
		drawArrow(textX + 120, textY + 20, yellowTarget.x, yellowTarget.y);
	} else if (tutorial.step === 2) {
		const textX = canvas.width / 2;
		const textY = 90;
		ctx.fillText('Pull back on the stone to set the angle and speed.', textX, textY);
		ctx.fillText('Let go to throw it', textX, textY + 30);
		const startWorld = { x: 0, y: tutorial.launchStartY };
		const downMeters = 6 * tutorial.feetToMeters;
		const rightMeters = 2 * tutorial.feetToMeters;
		const leftMeters = 3 * tutorial.feetToMeters;
		const downDuration = 1200;
		const pauseDownDuration = 1000;
		const rightDuration = 600;
		const pauseRightDuration = 1000;
		const leftDuration = 900;
		const endPauseDuration = 1000;
		const cycleDuration =
			downDuration + pauseDownDuration + rightDuration + pauseRightDuration + leftDuration + endPauseDuration;
		const startTime = tutorial.demoStart ?? tutorial.demoTime;
		const elapsed = startTime ? (tutorial.demoTime - startTime) : 0;
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
			y: tutorial.launchStartY - (downMeters * downProgress)
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
		const demoDragState = {
			stone: demoStone,
			startWorld,
			currentWorld,
			pullbackMeters,
			dragVector
		};
		drawDragGuides({ dragState: demoDragState, stoneRadius: tutorial.stoneRadius });
		drawStone(demoStone, tutorial.stoneRadius);
		drawThrowSpeedOverlay({ dragState: demoDragState, getThrowSpeed: tutorial.getThrowSpeed, feetToMeters: tutorial.feetToMeters });
	} else if (tutorial.step === 3) {
		const textX = canvas.width / 2;
		const textY = 200;
		ctx.fillText('Swipe to add rotation before the hog line', textX, textY);
		ctx.fillText('Faster swipe = faster rotation', textX, textY + 30);
		const endY = tutorial.hogLineNearY - (3 * tutorial.feetToMeters);
		const startWorld = { x: 0, y: endY - (21 * tutorial.feetToMeters) };
		const swipeDuration = 500;
		const swipePauseDuration = 1000;
		const swipeCount = 3;
		const cycleDuration = (swipeDuration + swipePauseDuration) * swipeCount;
		const startTime = tutorial.demoStart ?? tutorial.demoTime;
		const elapsed = startTime ? (tutorial.demoTime - startTime) : 0;
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
		drawStone(demoStone, tutorial.stoneRadius);
		const swipeSpan = 4 * tutorial.feetToMeters;
		const swipeX = (swipeProgress - 0.5) * swipeSpan;
		const swipeY = currentWorld.y + (1.2 * tutorial.feetToMeters);
		const swipeCanvas = worldToCanvas(swipeX, swipeY);
		ctx.save();
		ctx.globalAlpha = 0.5;
		ctx.fillStyle = '#fff';
		ctx.beginPath();
		ctx.arc(swipeCanvas.x, swipeCanvas.y, Math.max(12, tutorial.stoneRadius * getDisplayScale() * 0.6), 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	ctx.restore();
}

function drawSponsorImage(image, centerX, centerY, hogSponsor) {
	if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight) {
		return;
	}
	const widthMeters = hogSponsor.width * hogSponsor.scale;
	const referenceAspect = hogSponsor.pixelHeight / image.naturalWidth;
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

function drawHackPair(halfSpacing, yStart, yEnd, hackWidth) {
	drawRectangle(
		-(halfSpacing + hackWidth),
		yStart,
		-halfSpacing,
		yEnd,
		'#5d4037'
	);

	drawRectangle(
		halfSpacing,
		yStart,
		halfSpacing + hackWidth,
		yEnd,
		'#5d4037'
	);
}

function drawStones({ physicsEngine, stoneRadius }) {
	const stones = physicsEngine.getStones();
	for (const stone of stones) {
		drawStone(stone, stoneRadius);
	}
}

function drawStone(stone, stoneRadius) {
	const center = worldToCanvas(stone.position.x, stone.position.y);
	const displayScale = getDisplayScale();
	const radiusPx = Math.max(stoneRadius * displayScale, 3);
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

	drawStoneHandle(center, innerRadius, stone.angle ?? 0);
}

function drawThrowSpeedOverlay({ dragState, getThrowSpeed, feetToMeters }) {
	if (!dragState) {
		return;
	}
	const speed = getThrowSpeed(dragState.pullbackMeters);
	const text = `Speed: ${speed.toFixed(2)}`;
	const offset = 1 * feetToMeters;
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

function drawMiniMap({
	minimap,
	sheetExtents,
	measurements,
	lineMarkings,
	stoneRadius,
	dragState,
	readyStoneKey,
	isEndInProgress,
	scoringSequence,
	physicsEngine
}) {
	const minimapActive =
		!minimap.hidden &&
		(dragState ||
			(readyStoneKey && isEndInProgress && !scoringSequence && !physicsEngine.isRunning()));
	if (!minimapActive) {
		minimapBounds = null;
		return;
	}
	const worldXMin = sheetExtents.xMin;
	const worldXMax = sheetExtents.xMax;
	const worldYMin = minimap.yMin;
	const worldYMax = minimap.yMax;
	const worldWidth = worldXMax - worldXMin;
	const worldHeight = worldYMax - worldYMin;
	if (worldWidth <= 0 || worldHeight <= 0) {
		return;
	}

	const baseSize = Math.min(canvas.width, canvas.height) * minimap.scaleFraction;
	const minimapWidth = baseSize;
	const minimapHeight = baseSize * (worldHeight / worldWidth);
	const scale = minimapWidth / worldWidth;
	const contentWidth = worldWidth * scale;
	const contentHeight = worldHeight * scale;
	const boxX = canvas.width - minimapWidth - minimap.marginPx;
	const boxY = minimap.marginPx;
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
	if (0 >= worldYMin - measurements.rings.redOuter && 0 <= worldYMax + measurements.rings.redOuter) {
		drawHouseRing(measurements.rings.redOuter, '#1e88e5');
		drawHouseRing(measurements.rings.redInner, '#d8efff');
		drawHouseRing(measurements.rings.blueOuter, '#2e7d32');
		drawHouseRing(measurements.rings.blueInner, '#d8efff');
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
		const radiusPx = stoneRadius * scale;
		ctx.beginPath();
		ctx.fillStyle = stone.color === StoneColor.YELLOW ? '#fdd835' : '#c62828';
		ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.lineWidth = 1;
	ctx.strokeStyle = lineMarkings.hog.color;
	const hogLineLeft = worldToMiniMap(worldXMin, worldYMin);
	const hogLineRight = worldToMiniMap(worldXMax, worldYMin);
	ctx.beginPath();
	ctx.moveTo(hogLineLeft.x, hogLineLeft.y);
	ctx.lineTo(hogLineRight.x, hogLineRight.y);
	ctx.stroke();

	if (0 >= worldYMin && 0 <= worldYMax) {
		ctx.strokeStyle = lineMarkings.tee.color;
		const teeLeft = worldToMiniMap(worldXMin, 0);
		const teeRight = worldToMiniMap(worldXMax, 0);
		ctx.beginPath();
		ctx.moveTo(teeLeft.x, teeLeft.y);
		ctx.lineTo(teeRight.x, teeRight.y);
		ctx.stroke();
	}

	ctx.strokeStyle = lineMarkings.center.color;
	const centerTop = worldToMiniMap(0, worldYMax);
	const centerBottom = worldToMiniMap(0, worldYMin);
	ctx.beginPath();
	ctx.moveTo(centerTop.x, centerTop.y);
	ctx.lineTo(centerBottom.x, centerBottom.y);
	ctx.stroke();

	ctx.restore();
}

function drawStoneHandle(center, innerRadius, angle) {
	const handleThicknessMeters = 0.0508;
	const handleThicknessPx = Math.max(handleThicknessMeters * getDisplayScale(), 1.5);
	const handleLength = (innerRadius * 2) * 0.5;
	const startOffset = -innerRadius * 0.7;

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
	const radius = Math.max(radiusMeters * getDisplayScale(), 0.5);

	ctx.save();
	ctx.beginPath();
	ctx.fillStyle = fillStyle;
	ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}
