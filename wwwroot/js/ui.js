export function createUIController({ canvas, getDisplayScale, measurements, scoreboardState }) {
	let scoreboardElement = null;
	let scoreboardVisible = false;
	let timerElement = null;
	let friendTimerElement = null;
	let practiceBackElement = null;
	let winnerAnnouncementElement = null;
	let endScoreAnnouncementElement = null;
	let menuElement = null;
	let multiplayerInviteElement = null;
	let multiplayerInviteLinkElement = null;
	let multiplayerInviteStatusElement = null;
	let multiplayerInviteCopyButton = null;
	let multiplayerInviteCloseButton = null;
	let multiplayerInviteCreateButton = null;
	let multiplayerInviteColor = 'red';
	let multiplayerInviteCreateHandler = null;
	let centerNoteElement = null;
	let centerNoteTimeout = null;

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

	const createFriendTimerElement = () => {
		const el = document.createElement('div');
		el.className = 'friend-timer';
		el.setAttribute('role', 'status');
		el.setAttribute('aria-live', 'polite');
		el.innerHTML = '<div class="friend-timer-row"><span class="friend-timer-label">Red</span><span class="friend-timer-value">00:00</span></div><div class="friend-timer-row"><span class="friend-timer-label">Yellow</span><span class="friend-timer-value">00:00</span></div>';
		return el;
	};

	const mountFriendTimer = () => {
		friendTimerElement = createFriendTimerElement();
		const attach = () => {
			if (!document.body.contains(friendTimerElement)) {
				document.body.appendChild(friendTimerElement);
			}
		};
		if (document.body) {
			attach();
		} else {
			window.addEventListener('DOMContentLoaded', attach, { once: true });
		}
	};

	const setFriendTimerHidden = (hidden) => {
		if (!friendTimerElement) {
			return;
		}
		friendTimerElement.classList.toggle('is-hidden', hidden);
	};

	const setFriendTimerText = ({ redText, yellowText, redActive, yellowActive }) => {
		if (!friendTimerElement) {
			return;
		}
		const rows = friendTimerElement.querySelectorAll('.friend-timer-row');
		const redRow = rows[0];
		const yellowRow = rows[1];
		if (redRow) {
			const label = redRow.querySelector('.friend-timer-label');
			const value = redRow.querySelector('.friend-timer-value');
			if (label) {
				label.textContent = 'Red';
			}
			if (value) {
				value.textContent = redText;
			}
			redRow.classList.add('is-red');
			redRow.classList.toggle('is-active', !!redActive);
		}
		if (yellowRow) {
			const label = yellowRow.querySelector('.friend-timer-label');
			const value = yellowRow.querySelector('.friend-timer-value');
			if (label) {
				label.textContent = 'Yellow';
			}
			if (value) {
				value.textContent = yellowText;
			}
			yellowRow.classList.add('is-yellow');
			yellowRow.classList.toggle('is-active', !!yellowActive);
		}
	};

	const createPracticeBackElement = (onClick) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'practice-back';
		button.setAttribute('aria-label', 'Back to menu');
		button.innerHTML = '<span class="practice-back-icon">❮</span>';
		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (onClick) {
				onClick();
			}
		});
		return button;
	};

	const mountPracticeBackButton = ({ onClick }) => {
		practiceBackElement = createPracticeBackElement(onClick);
		const attach = () => {
			if (!document.body.contains(practiceBackElement)) {
				document.body.appendChild(practiceBackElement);
			}
		};
		if (document.body) {
			attach();
		} else {
			window.addEventListener('DOMContentLoaded', attach, { once: true });
		}
	};

	const setPracticeBackVisible = (visible) => {
		if (!practiceBackElement) {
			return;
		}
		practiceBackElement.classList.toggle('is-visible', visible);
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

	const createMultiplayerInviteElement = ({ onCopy, onClose }) => {
		const overlay = document.createElement('div');
		overlay.className = 'multiplayer-invite';

		const card = document.createElement('div');
		card.className = 'multiplayer-invite-card';

		const title = document.createElement('h2');
		title.textContent = 'Invite a friend';

		multiplayerInviteStatusElement = document.createElement('p');
		multiplayerInviteStatusElement.className = 'multiplayer-invite-status';
		multiplayerInviteStatusElement.textContent = 'Creating invite...';

		const colorRow = document.createElement('div');
		colorRow.className = 'multiplayer-invite-colors';
		const colorLabel = document.createElement('p');
		colorLabel.textContent = 'Choose your stone color:';
		colorRow.appendChild(colorLabel);

		const colorOptions = document.createElement('div');
		colorOptions.className = 'multiplayer-invite-color-options';
		['red', 'yellow'].forEach((color) => {
			const optionLabel = document.createElement('label');
			optionLabel.className = 'multiplayer-invite-color-option';
			const input = document.createElement('input');
			input.type = 'radio';
			input.name = 'multiplayer-color';
			input.value = color;
			input.checked = color === multiplayerInviteColor;
			input.addEventListener('change', () => {
				if (input.checked) {
					multiplayerInviteColor = color;
				}
			});
			const labelText = document.createElement('span');
			labelText.textContent = color === 'red' ? 'Red' : 'Yellow';
			optionLabel.appendChild(input);
			optionLabel.appendChild(labelText);
			colorOptions.appendChild(optionLabel);
		});

		colorRow.appendChild(colorOptions);

		const linkRow = document.createElement('div');
		linkRow.className = 'multiplayer-invite-link';

		multiplayerInviteLinkElement = document.createElement('input');
		multiplayerInviteLinkElement.type = 'text';
		multiplayerInviteLinkElement.readOnly = true;
		multiplayerInviteLinkElement.value = '';
		multiplayerInviteLinkElement.setAttribute('aria-label', 'Invite link');

		multiplayerInviteCopyButton = document.createElement('button');
		multiplayerInviteCopyButton.type = 'button';
		multiplayerInviteCopyButton.textContent = 'Copy link';
		multiplayerInviteCopyButton.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (onCopy) {
				onCopy(multiplayerInviteLinkElement?.value ?? '');
			}
		});

		linkRow.appendChild(multiplayerInviteLinkElement);
		linkRow.appendChild(multiplayerInviteCopyButton);

		multiplayerInviteCreateButton = document.createElement('button');
		multiplayerInviteCreateButton.type = 'button';
		multiplayerInviteCreateButton.className = 'multiplayer-invite-create';
		multiplayerInviteCreateButton.textContent = 'Create invite';
		multiplayerInviteCreateButton.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (multiplayerInviteCreateHandler) {
				multiplayerInviteCreateHandler(multiplayerInviteColor);
			}
		});

		multiplayerInviteCloseButton = document.createElement('button');
		multiplayerInviteCloseButton.type = 'button';
		multiplayerInviteCloseButton.className = 'multiplayer-invite-close';
		multiplayerInviteCloseButton.textContent = 'Close';
		multiplayerInviteCloseButton.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (onClose) {
				onClose();
			}
		});

		card.appendChild(title);
		card.appendChild(multiplayerInviteStatusElement);
		card.appendChild(colorRow);
		card.appendChild(multiplayerInviteCreateButton);
		card.appendChild(linkRow);
		card.appendChild(multiplayerInviteCloseButton);
		overlay.appendChild(card);

		return overlay;
	};

	const mountMultiplayerInvite = ({ onCopy, onClose, onCreate }) => {
		multiplayerInviteElement = createMultiplayerInviteElement({ onCopy, onClose });
		multiplayerInviteCreateHandler = onCreate ?? null;
		const attach = () => {
			if (!document.body.contains(multiplayerInviteElement)) {
				document.body.appendChild(multiplayerInviteElement);
			}
		};
		if (document.body) {
			attach();
		} else {
			window.addEventListener('DOMContentLoaded', attach, { once: true });
		}
	};

	const setMultiplayerInviteVisible = (visible) => {
		if (!multiplayerInviteElement) {
			return;
		}
		multiplayerInviteElement.classList.toggle('visible', visible);
	};

	const setMultiplayerInviteLink = (link) => {
		if (!multiplayerInviteLinkElement) {
			return;
		}
		multiplayerInviteLinkElement.value = link ?? '';
	};

	const setMultiplayerInviteStatus = (message) => {
		if (!multiplayerInviteStatusElement) {
			return;
		}
		multiplayerInviteStatusElement.textContent = message ?? '';
	};

	const setMultiplayerInviteCreateEnabled = (enabled) => {
		if (!multiplayerInviteCreateButton) {
			return;
		}
		multiplayerInviteCreateButton.disabled = !enabled;
	};

	const setMultiplayerInviteColor = (color) => {
		multiplayerInviteColor = color;
		if (!multiplayerInviteElement) {
			return;
		}
		const inputs = multiplayerInviteElement.querySelectorAll('input[name="multiplayer-color"]');
		inputs.forEach((input) => {
			input.checked = input.value === color;
		});
	};

	const setMultiplayerInviteRole = (role) => {
		if (!multiplayerInviteElement) {
			return;
		}
		multiplayerInviteElement.classList.toggle('is-guest', role === 'guest');
	};

	const createCenterNoteElement = () => {
		const el = document.createElement('div');
		el.className = 'center-note';
		el.setAttribute('role', 'status');
		el.setAttribute('aria-live', 'polite');
		el.textContent = '';
		return el;
	};

	const mountCenterNote = () => {
		centerNoteElement = createCenterNoteElement();
		const attach = () => {
			if (!document.body.contains(centerNoteElement)) {
				document.body.appendChild(centerNoteElement);
			}
		};
		if (document.body) {
			attach();
		} else {
			window.addEventListener('DOMContentLoaded', attach, { once: true });
		}
	};

	const showCenterNote = (message, durationMs = 4000) => {
		if (!centerNoteElement) {
			return;
		}
		centerNoteElement.textContent = message;
		centerNoteElement.classList.add('visible');
		if (centerNoteTimeout) {
			clearTimeout(centerNoteTimeout);
		}
		centerNoteTimeout = window.setTimeout(() => {
			centerNoteElement?.classList.remove('visible');
		}, durationMs);
	};

	return {
		mountScoreboard,
		renderScoreboard,
		updateScoreboardLayout,
		setScoreboardVisible,
		mountTimer,
		setTimerText,
		setTimerHidden,
		mountFriendTimer,
		setFriendTimerText,
		setFriendTimerHidden,
		mountPracticeBackButton,
		setPracticeBackVisible,
		mountWinnerAnnouncement,
		mountEndScoreAnnouncement,
		showWinnerAnnouncement,
		hideWinnerAnnouncement,
		showEndScoreAnnouncement,
		hideEndScoreAnnouncement,
		mountMenu,
		setMenuVisible,
		mountMultiplayerInvite,
		setMultiplayerInviteVisible,
		setMultiplayerInviteLink,
		setMultiplayerInviteStatus,
		setMultiplayerInviteCreateEnabled,
		setMultiplayerInviteColor,
		setMultiplayerInviteRole,
		mountCenterNote,
		showCenterNote,
		getScoreboardVisible: () => scoreboardVisible
	};
}
