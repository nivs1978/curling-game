import {
	clearCameraFollowStone,
	clampCameraPosition,
	getCameraFollowStone,
	getCameraYForLaunch,
	getDisplayScale,
	screenToWorld,
	setCameraFollowStone,
	worldToCanvas
} from './camera.js';

export function createInputController(config) {
	let dragState = null;
	let sweepState = null;
	let swipeState = null;
	let acknowledgePointerId = null;

	function getDragState() {
		return dragState;
	}

	function resetInteractions() {
		dragState = null;
		sweepState = null;
		swipeState = null;
		acknowledgePointerId = null;
		config.physicsEngine.clearSweepState?.();
	}

	function clearSweepState() {
		sweepState = null;
		config.physicsEngine.clearSweepState?.();
	}

	function getCanvasRelativePosition(evt) {
		const rect = config.canvas.getBoundingClientRect();
		const scaleX = config.canvas.width / rect.width;
		const scaleY = config.canvas.height / rect.height;
		return {
			x: (evt.clientX - rect.left) * scaleX,
			y: (evt.clientY - rect.top) * scaleY
		};
	}

	function canStartDrag() {
		return (
			config.isEndInProgress() &&
			!config.isGameOver() &&
			!config.isScoringSequenceActive() &&
			!config.isPhysicsRunning()
		);
	}

	function isPointOnStone(pointWorld, stone) {
		const dx = pointWorld.x - stone.position.x;
		const dy = pointWorld.y - stone.position.y;
		return Math.hypot(dx, dy) <= config.stoneRadius * 1.3;
	}

	function getSweepStone() {
		const followStone = getCameraFollowStone();
		const stone = followStone ?? config.getStoneByKey(config.getLastLaunchedStoneKey());
		if (!stone || !stone.isLaunched || stone.isOut) {
			return null;
		}
		if (stone.hogTiming?.nearCrossedAt == null) {
			return null;
		}
		if (stone.position.y < config.hogLineNearY || stone.position.y > 0) {
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
			stoneKey: config.getStoneKey(stone),
			mode: null
		};
		return true;
	}

	function applySweepEffect(mode, stoneKey) {
		if (!mode || !stoneKey) {
			return;
		}
		const frictionMultiplier = Math.max(0, 1 - config.sweepFrictionReduction);
		const curlMultiplier = mode === 'horizontal' ? 0 : 1 + config.sweepCurlBoost;
		config.physicsEngine.setSweepState?.({
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
		if (distance < config.sweepMinDistancePx) {
			return;
		}
		const absX = Math.abs(dx);
		const absY = Math.abs(dy);
		let mode = null;
		if (absX > absY * config.sweepDirectionRatio) {
			mode = 'horizontal';
		} else if (absY > absX * config.sweepDirectionRatio) {
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
		clearSweepState();
	}

	function beginStoneDrag(pointerId, screenPoint) {
		if (!canStartDrag()) {
			return false;
		}
		const stone = config.getStoneByKey(config.getReadyStoneKey());
		if (!config.isStoneAvailable(stone)) {
			return false;
		}
		const pointWorld = screenToWorld(screenPoint.x, screenPoint.y);
		if (!isPointOnStone(pointWorld, stone)) {
			return false;
		}
		const startWorld = { x: 0, y: config.launchStartY };
		config.resetStoneForLaunch(stone, startWorld);
		dragState = {
			stone,
			pointerId,
			startWorld,
			startScreen: worldToCanvas(startWorld.x, startWorld.y),
			currentWorld: { ...startWorld },
			pullbackMeters: 0,
			dragVector: { x: 0, y: 0 }
		};
		clearCameraFollowStone();
		config.camera.y = getCameraYForLaunch(startWorld.y);
		clampCameraPosition({ allowBeyondBottom: true });
		return true;
	}

	function updateStoneDrag(screenPoint) {
		if (!dragState) {
			return;
		}
		const displayScale = getDisplayScale();
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
		const clampedLength = Math.min(rawLength, config.maxPullbackMeters);
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

		config.resetStoneForLaunch(stone, startWorld);

		const speed = config.getThrowSpeed(pullbackMeters);
		const vectorLength = Math.hypot(dragVector.x, dragVector.y);
		const direction = vectorLength > 0
			? { x: -dragVector.x / vectorLength, y: -dragVector.y / vectorLength }
			: { x: 0, y: 1 };
		const velocity = {
			vx: direction.x * speed,
			vy: direction.y * speed
		};

		const launchedStone = config.physicsEngine.throwStone({
			color: stone.color,
			number: stone.number,
			velocity,
			rotationRadiansPerSecond: 0,
			offsetX: startWorld.x
		});
		if (config.launchSound) {
			config.launchSound.currentTime = 0;
			config.launchSound.play().catch(() => {});
		}
		config.camera.y = getCameraYForLaunch(startWorld.y);
		clampCameraPosition({ allowBeyondBottom: true });
		setCameraFollowStone(launchedStone, { instant: true });
		config.renderScoreboard();
		config.setLastLaunchedStoneKey(config.getStoneKey(launchedStone));
		const nextThrowIndex = config.getCurrentThrowIndex() + 1;
		config.setCurrentThrowIndex(nextThrowIndex);
		config.setNextTeamColorPending(config.getColorForThrowIndex(nextThrowIndex));
		config.setReadyStoneKey(null);
	}

	function getRotationSwipeStone() {
		const followStone = getCameraFollowStone();
		const stone = followStone ?? config.getStoneByKey(config.getLastLaunchedStoneKey());
		if (!stone || !stone.isLaunched || stone.isOut) {
			return null;
		}
		if (stone.hogTiming?.nearCrossedAt != null) {
			return null;
		}
		if (stone.position.y >= config.hogLineNearY) {
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
			stoneKey: config.getStoneKey(stone)
		};
		return true;
	}

	function finishRotationSwipe(pointerId, screenPoint) {
		if (!swipeState || swipeState.pointerId !== pointerId) {
			return;
		}
		const stone = config.getStoneByKey(swipeState.stoneKey);
		const endTime = performance.now();
		const elapsedSeconds = (endTime - swipeState.startTime) / 1000;
		const dxScreen = screenPoint.x - swipeState.startScreen.x;
		const dxWorld = dxScreen / getDisplayScale();
		const speedMetersPerSecond = elapsedSeconds > 0 ? Math.abs(dxWorld) / elapsedSeconds : 0;
		const referenceSpeed = config.rotationSwipeReferenceDistance / config.rotationSwipeReferenceTime;
		const normalized = referenceSpeed > 0 ? speedMetersPerSecond / referenceSpeed : 0;
		const rotationRate =
			Math.sign(dxWorld) * Math.min(config.maxRotationRate, normalized * config.maxRotationRate);
		const shouldApply =
			stone &&
			rotationRate !== 0 &&
			stone.isLaunched &&
			!stone.isOut &&
			stone.hogTiming?.nearCrossedAt == null &&
			stone.position.y < config.hogLineNearY;

		if (shouldApply) {
			stone.rotationRate = rotationRate;
			stone.pendingRotationRate = 0;
			stone.rotationActivated = true;
			stone.hasStoppedNotified = false;
		}

		swipeState = null;
	}

	function onPointerDown(evt) {
		if (config.isMenuVisible()) {
			return;
		}
		if (config.getCurrentMode() === config.gameMode.TUTORIAL) {
			config.advanceTutorial();
			return;
		}
		if (config.getPendingRoundAction()) {
			acknowledgePointerId = evt.pointerId;
			config.canvas.setPointerCapture?.(evt.pointerId);
			return;
		}
		if (config.getMinimapHidden()) {
			config.setMinimapHidden(false);
			config.setCameraToLaunchPosition();
			return;
		}
		const screenPoint = getCanvasRelativePosition(evt);
		if (config.isPointInMinimap(screenPoint)) {
			config.setMinimapHidden(true);
			config.setCameraToEndLineTop();
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
				config.canvas.setPointerCapture?.(evt.pointerId);
				return;
			}
			if (beginStoneDrag(evt.pointerId, screenPoint)) {
				config.canvas.setPointerCapture?.(evt.pointerId);
				return;
			}
			if (beginRotationSwipe(evt.pointerId, screenPoint)) {
				config.canvas.setPointerCapture?.(evt.pointerId);
				return;
			}
			return;
		}

		if (evt.pointerType === 'touch') {
			evt.preventDefault();
			if (beginSweep(evt.pointerId, screenPoint)) {
				config.canvas.setPointerCapture?.(evt.pointerId);
				return;
			}
			if (beginStoneDrag(evt.pointerId, screenPoint)) {
				config.canvas.setPointerCapture?.(evt.pointerId);
				return;
			}
			if (beginRotationSwipe(evt.pointerId, screenPoint)) {
				config.canvas.setPointerCapture?.(evt.pointerId);
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
		if (config.getCurrentMode() === config.gameMode.TUTORIAL) {
			return;
		}
		if (config.getPendingRoundAction() && acknowledgePointerId === evt.pointerId) {
			acknowledgePointerId = null;
			config.canvas.releasePointerCapture?.(evt.pointerId);
			config.onPendingRoundAction();
			return;
		}
		if (sweepState && sweepState.pointerId === evt.pointerId) {
			endSweep(evt.pointerId);
			config.canvas.releasePointerCapture?.(evt.pointerId);
			return;
		}
		if (dragState && dragState.pointerId === evt.pointerId) {
			finishStoneDrag();
			config.canvas.releasePointerCapture?.(evt.pointerId);
			return;
		}
		if (swipeState && swipeState.pointerId === evt.pointerId) {
			finishRotationSwipe(evt.pointerId, getCanvasRelativePosition(evt));
			config.canvas.releasePointerCapture?.(evt.pointerId);
			return;
		}
	}

	function onPointerLeave(evt) {
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
	}

	return {
		getDragState,
		resetInteractions,
		clearSweepState,
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onPointerLeave
	};
}
