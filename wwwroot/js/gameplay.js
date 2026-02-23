export function createGameplayController(config) {
	const getTotalScheduledEnds = () => {
		const firstTeam = config.scoreboardState.teams[0];
		return firstTeam ? firstTeam.scores.length : config.baseEnds;
	};

	const ensureScoreCapacity = (endIndex) => {
		config.scoreboardState.teams.forEach((team) => {
			while (team.scores.length <= endIndex) {
				team.scores.push('');
			}
		});
	};

	const addExtraEndColumn = () => {
		config.scoreboardState.teams.forEach((team) => {
			team.scores.push('');
		});
		config.teamThinkTimeRemaining[config.StoneColor.RED] += config.extraEndThinkTimeSeconds;
		config.teamThinkTimeRemaining[config.StoneColor.YELLOW] += config.extraEndThinkTimeSeconds;
		config.updateTimerLabel();
	};

	const getRemainingStones = (color) => {
		const stones = config.physicsEngine.getStones().filter((stone) => stone.color === color);
		const used = stones.reduce((count, stone) => {
			if (stone.isLaunched || stone.isOut) {
				return count + 1;
			}
			return count;
		}, 0);
		return Math.max(0, config.stonesPerTeam - used);
	};

	const areAllThrowsCompleted = () =>
		config.scoreboardState.teams.every(
			(team) => getRemainingStones(team.stoneColor) === 0
		);

	const hasMultipleColors = (stones) => {
		if (stones.length === 0) {
			return false;
		}
		const firstColor = stones[0].color;
		return stones.some((stone) => stone.color !== firstColor);
	};

	const buildEndScoringPlan = () => {
		const stones = config.physicsEngine.getStones();
		const scoringRadius = config.houseRadius + config.stoneRadius;
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
	};

	const startScoreAnimation = () => {
		if (config.getScoringSequence()) {
			return;
		}
		const plan = buildEndScoringPlan();
		config.clearCameraFollowStone();
		config.setScoringSequence({
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
		});
	};

	const getTeamNameByColor = (color) => {
		const team = config.scoreboardState.teams.find((entry) => entry.stoneColor === color);
		return team?.name ?? 'Team';
	};

	const recordEndScore = (winningColor, points) => {
		ensureScoreCapacity(config.getCurrentEndIndex());
		config.scoreboardState.teams.forEach((team) => {
			if (winningColor == null) {
				team.scores[config.getCurrentEndIndex()] = '0';
				return;
			}
			if (team.stoneColor === winningColor) {
				team.scores[config.getCurrentEndIndex()] = String(points);
				team.total += points;
			} else {
				team.scores[config.getCurrentEndIndex()] = '0';
			}
		});
		config.setCurrentEndIndex(config.getCurrentEndIndex() + 1);
		config.renderScoreboard();
	};

	const finalizeEndResult = (winningColor, points) => {
		config.setEndResultCommitted(true);
		config.setIsEndInProgress(false);
		recordEndScore(winningColor, points);
		if (winningColor && points > 0) {
			config.setStartingTeamColor(winningColor);
		}
		const scheduledEnds = getTotalScheduledEnds();
		const totals = config.scoreboardState.teams.map((team) => team.total);
		const isTie = totals[0] === totals[1];
		if (config.getCurrentEndIndex() >= scheduledEnds) {
			if (isTie) {
				addExtraEndColumn();
				config.renderScoreboard();
				config.setPendingRoundAction('nextEnd');
				config.setScoreboardVisible(true);
				return;
			}
			const winningTeam = totals[0] > totals[1]
				? config.scoreboardState.teams[0]
				: config.scoreboardState.teams[1];
			concludeGame(winningTeam);
			config.setPendingRoundAction('newGame');
			config.setScoreboardVisible(true);
			return;
		}
		config.setPendingRoundAction('nextEnd');
		config.setScoreboardVisible(true);
	};

	const scoreCurrentEnd = () => {
		ensureScoreCapacity(config.getCurrentEndIndex());
		const stones = config.physicsEngine.getStones();
		const scoringRadius = config.houseRadius + config.stoneRadius;
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
		stonesOutsideHouse.forEach(config.relocateStoneToOutTray);
		if (stonesInHouse.length === 0) {
			finalizeEndResult(null, 0);
			return;
		}
		stonesInHouse.sort((a, b) => a.distance - b.distance);
		const ordered = stonesInHouse.map((entry) => entry.stone);
		while (ordered.length > 0 && hasMultipleColors(ordered)) {
			const removed = ordered.pop();
			config.relocateStoneToOutTray(removed);
		}
		const winningColor = ordered.length > 0 ? ordered[0].color : null;
		const points = ordered.length;
		finalizeEndResult(winningColor, points);
	};

	const maybeHandleEndCompletion = () => {
		if (config.getCurrentMode() === config.GameMode.PRACTICE) {
			if (!config.getIsEndInProgress()) {
				return;
			}
			if (getRemainingStones(config.StoneColor.RED) > 0) {
				return;
			}
			if (config.physicsEngine.isRunning() || config.inputController.getDragState()) {
				return;
			}
			config.showMenu();
			return;
		}
		if (!config.getIsEndInProgress() || config.getEndResultCommitted()) {
			return;
		}
		if (!areAllThrowsCompleted()) {
			return;
		}
		if (config.physicsEngine.isRunning() || config.inputController.getDragState()) {
			return;
		}
		if (!config.getScoringSequence()) {
			startScoreAnimation();
		}
	};

	const updateScoringSequence = (timestamp) => {
		const sequence = config.getScoringSequence();
		if (!sequence) {
			return;
		}
		if (config.getCurrentMode() === config.GameMode.TUTORIAL) {
			return;
		}

		if (sequence.phase === 'camera') {
			const delta = config.scoringSettings.cameraTargetY - config.camera.y;
			config.camera.y += delta * config.scoringSettings.cameraLerp;
			config.clampCameraPosition();
			if (Math.abs(delta) < 0.08) {
				if (sequence.cameraSettledAt == null) {
					sequence.cameraSettledAt = timestamp;
				}
				if (timestamp - sequence.cameraSettledAt >= config.scoringSettings.cameraSettleMs) {
					sequence.phase = 'removing';
					sequence.nextRemoveAt = timestamp + config.scoringSettings.removeIntervalMs;
				}
			} else {
				sequence.cameraSettledAt = null;
			}
			return;
		}

		if (sequence.phase === 'removing') {
			if (sequence.removalQueue.length === 0) {
				sequence.phase = 'announce';
				sequence.messageEndAt = timestamp + config.scoringSettings.messageDurationMs;
				return;
			}

			if (timestamp >= (sequence.nextRemoveAt ?? 0)) {
				const nextStone = sequence.removalQueue.shift();
				if (nextStone) {
					config.relocateStoneToOutTray(nextStone);
					config.renderScoreboard();
				}
				sequence.nextRemoveAt = timestamp + config.scoringSettings.removeIntervalMs;
			}
			return;
		}

		if (sequence.phase === 'announce') {
			if (!sequence.messageShown) {
				const { winningColor, points } = sequence;
				const message =
					winningColor && points > 0
						? `${getTeamNameByColor(winningColor)} scores ${points} point${points === 1 ? '' : 's'}`
						: 'No score';
				config.showEndScoreAnnouncement(message);
				config.setScoreboardVisible(true);
				sequence.messageShown = true;
				sequence.messageHideAt = timestamp + config.scoringSettings.messageDurationMs;
				sequence.messageEndAt =
					sequence.messageHideAt + config.scoringSettings.postMessageDelayMs;
			}
			if (!sequence.messageHidden && timestamp >= (sequence.messageHideAt ?? 0)) {
				config.hideEndScoreAnnouncement();
				sequence.messageHidden = true;
			}
			if (timestamp >= (sequence.messageEndAt ?? 0)) {
				const { winningColor, points } = sequence;
				config.setScoringSequence(null);
				finalizeEndResult(winningColor, points);
			}
		}
	};

	const startNewEnd = (initialColor) => {
		if (config.getIsGameOver()) {
			return;
		}
		config.setStartingTeamColor(initialColor);
		ensureScoreCapacity(config.getCurrentEndIndex());
		config.resetStonesToHomeTrays();
		config.inputController.resetInteractions();
		config.setCurrentThrowIndex(0);
		config.setReadyStoneKey(null);
		config.setPendingRoundAction(null);
		config.setNextTeamColorPending(null);
		config.setActiveTeamColor(config.getStartingTeamColor());
		config.hideEndScoreAnnouncement();
		config.setScoringSequence(null);
		config.renderScoreboard();
		config.setScoreboardVisible(false);
		config.stopThinkingTimer();
		config.setIsEndInProgress(true);
		config.setEndResultCommitted(false);
		config.hideWinnerAnnouncement();
		config.ensureReadyStone();
	};

	const concludeGame = (team) => {
		config.setIsGameOver(true);
		config.setIsEndInProgress(false);
		config.setReadyStoneKey(null);
		const name = team?.name ?? 'Team';
		config.hideEndScoreAnnouncement();
		config.showWinnerAnnouncement(`${name} wins!`);
		config.setScoreboardVisible(true);
		config.stopThinkingTimer();
	};

	const resetGameState = () => {
		config.setCurrentEndIndex(0);
		config.setStartingTeamColor(config.StoneColor.RED);
		config.setIsGameOver(false);
		config.setEndResultCommitted(false);
		config.setPendingRoundAction(null);
		config.setNextTeamColorPending(null);
		config.inputController.resetInteractions();
		config.stopThinkingTimer();
		const baseScores = Array(config.baseEnds).fill('');
		config.scoreboardState.teams.forEach((team) => {
			team.scores = [...baseScores];
			team.total = 0;
		});
		config.teamThinkTimeRemaining[config.StoneColor.RED] = config.teamThinkTimeSeconds;
		config.teamThinkTimeRemaining[config.StoneColor.YELLOW] = config.teamThinkTimeSeconds;
		config.setTimerDisplayColor(config.getStartingTeamColor());
		config.setActiveTeamColor(config.getStartingTeamColor());
		config.renderScoreboard();
		config.hideWinnerAnnouncement();
	};

	const handlePendingRoundAction = () => {
		config.setScoreboardVisible(false);
		config.hideEndScoreAnnouncement();
		if (config.getPendingRoundAction() === 'nextEnd') {
			startNewEnd(config.getStartingTeamColor());
			return;
		}
		if (config.getPendingRoundAction() === 'newGame') {
			resetGameState();
			startNewEnd(config.getStartingTeamColor());
		}
	};

	return {
		getTotalScheduledEnds,
		getRemainingStones,
		areAllThrowsCompleted,
		maybeHandleEndCompletion,
		scoreCurrentEnd,
		updateScoringSequence,
		startNewEnd,
		concludeGame,
		resetGameState,
		handlePendingRoundAction
	};
}
