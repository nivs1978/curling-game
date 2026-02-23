export function createAudioManager({ getStoneKey, getLastLaunchedStoneKey } = {}) {
	const launchSound = new Audio('snd/launch.ogg');
	launchSound.preload = 'auto';
	launchSound.load();

	const createSoundPool = (src, size = 6) => {
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
	};

	const impactLowSounds = createSoundPool('snd/impact_low.ogg');
	const impactMediumSounds = createSoundPool('snd/impact_medium.ogg');
	const impactHighSounds = createSoundPool('snd/impact_high.ogg');
	const faultSounds = createSoundPool('snd/fault.ogg', 3);

	const handleStoneCollision = (speed) => {
		if (speed < 0.5) {
			impactLowSounds.play();
			return;
		}
		if (speed < 1) {
			impactMediumSounds.play();
			return;
		}
		impactHighSounds.play();
	};

	const handleStoneOut = (stone, reason) => {
		if (!getStoneKey || !getLastLaunchedStoneKey) {
			return;
		}
		if ((reason === 'outOfBounds' || reason === 'hog') && getStoneKey(stone) === getLastLaunchedStoneKey()) {
			if (!launchSound.paused) {
				launchSound.pause();
				launchSound.currentTime = 0;
			}
			faultSounds.play();
		}
	};

	return {
		launchSound,
		handleStoneCollision,
		handleStoneOut
	};
}
