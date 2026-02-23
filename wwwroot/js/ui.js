export function createUIController({ canvas, getDisplayScale, measurements, scoreboardState }) {
	let scoreboardElement = null;
	let scoreboardVisible = false;
	let timerElement = null;
	let winnerAnnouncementElement = null;
	let endScoreAnnouncementElement = null;
	let menuElement = null;

	const createScoreboardElement = () => {
		const container = document.createElement('div');
		container.className = 'scoreboard-container';
		const table = document.createElement('table');
		table.setAttribute('aria-label', 'Curling scoreboard');
		container.appendChild(table);
		return container;
	};

	const renderScoreboard = ({ scheduledEnds, currentEndIndex, isGameOver }) => {
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
	};

	const updateScoreboardLayout = () => {
		if (!scoreboardElement || !canvas) {
			return;
		}
		const trackWidthPx = measurements.trackWidth * getDisplayScale();
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
	};

	const setScoreboardVisible = (visible) => {
		scoreboardVisible = visible;
		if (!scoreboardElement) {
			return;
		}
		scoreboardElement.classList.toggle('is-visible', visible);
		if (visible) {
			updateScoreboardLayout();
		}
	};

	const mountScoreboard = () => {
		scoreboardElement = createScoreboardElement();
		const attach = () => {
			if (!document.body.contains(scoreboardElement)) {
				document.body.appendChild(scoreboardElement);
			}
			setScoreboardVisible(false);
		};
		if (document.body) {
			attach();
		} else {
			window.addEventListener('DOMContentLoaded', attach, { once: true });
		}
	};

	const createTimerElement = () => {
		const el = document.createElement('div');
		el.className = 'think-timer';
		el.setAttribute('role', 'status');
		el.setAttribute('aria-live', 'polite');
		el.textContent = '';
		return el;
	};

	const mountTimer = () => {
		timerElement = createTimerElement();
		const attach = () => {
			if (!document.body.contains(timerElement)) {
				document.body.appendChild(timerElement);
			}
		};
		if (document.body) {
			attach();
		} else {
			window.addEventListener('DOMContentLoaded', attach, { once: true });
		}
	};

	const setTimerText = (text) => {
		if (!timerElement) {
			return;
		}
		timerElement.textContent = text;
	};

	const setTimerHidden = (hidden) => {
		if (!timerElement) {
			return;
		}
		timerElement.classList.toggle('is-hidden', hidden);
	};

	const createWinnerAnnouncementElement = () => {
		const el = document.createElement('div');
		el.className = 'winner-announcement';
		el.setAttribute('role', 'status');
		el.setAttribute('aria-live', 'polite');
		el.textContent = '';
		return el;
	};

	const createEndScoreAnnouncementElement = () => {
		const el = document.createElement('div');
		el.className = 'end-score-announcement';
		el.setAttribute('role', 'status');
		el.setAttribute('aria-live', 'polite');
		el.textContent = '';
		return el;
	};

	const mountWinnerAnnouncement = () => {
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
	};

	const mountEndScoreAnnouncement = () => {
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
	};

	const showWinnerAnnouncement = (message) => {
		if (!winnerAnnouncementElement) {
			return;
		}
		winnerAnnouncementElement.textContent = message;
		winnerAnnouncementElement.classList.add('visible');
	};

	const hideWinnerAnnouncement = () => {
		if (!winnerAnnouncementElement) {
			return;
		}
		winnerAnnouncementElement.classList.remove('visible');
	};

	const showEndScoreAnnouncement = (message) => {
		if (!endScoreAnnouncementElement) {
			return;
		}
		endScoreAnnouncementElement.textContent = message;
		endScoreAnnouncementElement.classList.add('visible');
	};

	const hideEndScoreAnnouncement = () => {
		if (!endScoreAnnouncementElement) {
			return;
		}
		endScoreAnnouncementElement.classList.remove('visible');
	};

	const createMenuButton = (label, onClick) => {
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
	};

	const mountMenu = ({ items }) => {
		menuElement = document.createElement('div');
		menuElement.className = 'game-menu';
		items.forEach((item) => {
			menuElement.appendChild(createMenuButton(item.label, item.onClick));
		});
		const attach = () => {
			if (!document.body.contains(menuElement)) {
				document.body.appendChild(menuElement);
			}
		};
		if (document.body) {
			attach();
		} else {
			window.addEventListener('DOMContentLoaded', attach, { once: true });
		}
	};

	const setMenuVisible = (visible) => {
		if (!menuElement) {
			return;
		}
		menuElement.classList.toggle('visible', visible);
	};

	return {
		mountScoreboard,
		renderScoreboard,
		updateScoreboardLayout,
		setScoreboardVisible,
		mountTimer,
		setTimerText,
		setTimerHidden,
		mountWinnerAnnouncement,
		mountEndScoreAnnouncement,
		showWinnerAnnouncement,
		hideWinnerAnnouncement,
		showEndScoreAnnouncement,
		hideEndScoreAnnouncement,
		mountMenu,
		setMenuVisible,
		getScoreboardVisible: () => scoreboardVisible
	};
}
