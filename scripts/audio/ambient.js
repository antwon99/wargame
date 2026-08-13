import { AudioDebugBus } from './debugBus.js';
import { WeightedSelector } from './selectors.js';

// === AMBIENT MUSIC TUNING ===
// These values shape the Minecraft-like ambience cadence. Adjust them to tweak
// how gently music enters/leaves and how long the silence between tracks lasts.
const AMBIENT_DEFAULTS = {
    gentleStartVolume: 0.18,
    fadeInMs: 1400,
    fadeOutMs: 1600,
    tailFadeMs: 1200,
    minSilenceMs: 10000,
    maxSilenceMs: 45000,
    initialDelayRangeMs: [400, 4000]
};

const AMBIENT_FEATURE_FLAGS = {
    bedsEnabled: true
};

/**
 * Dedicated timer book-keeper for ambient playback. Separating this logic keeps
 * AmbientConductor focused on state transitions while still allowing tests to
 * inject deterministic schedulers.
 */
class AmbientScheduler {
    constructor(backend = {}) {
        this.backend = {
            setTimeout: backend.setTimeout ? backend.setTimeout.bind(backend) : ((...args) => setTimeout(...args)),
            clearTimeout: backend.clearTimeout ? backend.clearTimeout.bind(backend) : ((id) => clearTimeout(id)),
            setInterval: backend.setInterval ? backend.setInterval.bind(backend) : ((...args) => setInterval(...args)),
            clearInterval: backend.clearInterval ? backend.clearInterval.bind(backend) : ((id) => clearInterval(id))
        };
        this.fadeIntervals = new Map();
        this.nextTimer = null;
        this.fallbackTimer = null;
    }

    scheduleNext(callback, delayMs) {
        this.clearNext();
        this.nextTimer = this.backend.setTimeout(callback, delayMs);
        return this.nextTimer;
    }

    scheduleFallback(callback, delayMs) {
        this.clearFallback();
        this.fallbackTimer = this.backend.setTimeout(callback, delayMs);
        return this.fallbackTimer;
    }

    clearNext() {
        if (this.nextTimer !== null) {
            this.backend.clearTimeout(this.nextTimer);
            this.nextTimer = null;
        }
    }

    clearFallback() {
        if (this.fallbackTimer !== null) {
            this.backend.clearTimeout(this.fallbackTimer);
            this.fallbackTimer = null;
        }
    }

    scheduleFade(node, intervalMs, stepFn) {
        if (!node || typeof stepFn !== 'function') return null;
        this.clearFade(node);
        const id = this.backend.setInterval(stepFn, intervalMs);
        this.fadeIntervals.set(node, id);
        return id;
    }

    clearFade(node) {
        const intervalId = this.fadeIntervals.get(node);
        if (intervalId !== undefined) {
            this.backend.clearInterval(intervalId);
            this.fadeIntervals.delete(node);
        }
    }

    clearAll() {
        this.clearNext();
        this.clearFallback();
        this.fadeIntervals.forEach((intervalId) => this.backend.clearInterval(intervalId));
        this.fadeIntervals.clear();
    }
}

/**
 * Encapsulates the randomness powering ambient playback: how long to wait, and
 * which track to pick. Keeping this separate makes it easy to swap in
 * deterministic RNGs for tests or analytics.
 */
class AmbientRandomizer {
    constructor(randomFn = Math.random, defaults = AMBIENT_DEFAULTS) {
        this.random = randomFn;
        this.defaults = defaults;
        this.trackSelectors = new Map();
        this.lastTrackByMode = new Map();
    }

    /** Ensure each track has a uniform weight and stable identity. */
    normalizeTracks(tracks = []) {
        return tracks.map((track, idx) => ({
            ...track,
            weight: 1,
            id: track.id || track.key || track.src || `v${idx}`
        }));
    }

    randomSilence(config = {}) {
        const [min, max] = config.silenceRangeMs || [this.defaults.minSilenceMs, this.defaults.maxSilenceMs];
        const span = Math.max(0, max - min);
        return min + Math.floor(this.random() * span);
    }

    randomInitialDelay() {
        const [min, max] = this.defaults.initialDelayRangeMs;
        const span = Math.max(0, max - min);
        return min + Math.floor(this.random() * span);
    }

    pickTrack(mode, tracks = []) {
        if (!tracks.length) return null;
        let selector = this.trackSelectors.get(mode);
        if (!selector || selector.source !== tracks) {
            selector = new WeightedSelector(this.normalizeTracks(tracks));
            selector.source = tracks;
            this.trackSelectors.set(mode, selector);
        } else {
            selector.setEntries(this.normalizeTracks(tracks));
            selector.source = tracks;
        }

        const lastTrack = this.lastTrackByMode.get(mode);
        let pick = selector.pick(this.random);

        if (tracks.length > 1 && lastTrack && pick?.id === lastTrack.id) {
            const filteredEntries = selector.entries.filter((entry) => entry.id !== lastTrack.id);
            pick = new WeightedSelector(filteredEntries).pick(this.random);
        }

        if (pick) this.lastTrackByMode.set(mode, pick);
        return pick;
    }
}

/**
 * Coordinates long-form ambience/music tracks with random delays and soft
 * crossfades so war/territory states feel alive without looping endlessly.
 */
class AmbientConductor {
    constructor(audioManager, options = {}) {
        this.audioManager = audioManager;
        this.currentMode = options.initialMode || 'TERRITORY';
        this.states = options.states || {};
        this.maxOverlapMs = options.maxOverlapMs || 10000;
        this.bedsEnabled = options.bedsEnabled ?? AMBIENT_FEATURE_FLAGS.bedsEnabled;
        const defaults = { ...AMBIENT_DEFAULTS, ...(options.defaults || {}) };
        this.defaults = defaults;
        this.randomizer = options.randomizer || new AmbientRandomizer(options.random || Math.random, defaults);
        this.scheduler = options.scheduler instanceof AmbientScheduler
            ? options.scheduler
            : new AmbientScheduler(options.scheduler || {});
        this.activeHandle = null;
        this.activeBeds = new Map();
        this.active = false;
    }

    /** Begin scheduling tracks for the current mode. Safe to call repeatedly. */
    start(options = {}) {
        this.active = true;
        this.clearTimers();
        this.stopCurrent({ fadeMs: options.fadeMs ?? this.getConfig()?.fadeMs });
        this.startBedsForMode(this.currentMode, options.fadeMs);
        this.scheduleNext(true);
        return true;
    }

    /** Immediately stop any playing music and pending timers. */
    stopAll() {
        this.active = false;
        this.clearTimers();
        this.stopCurrent({ fadeMs: this.getConfig()?.fadeMs });
        this.stopBeds({ fadeMs: this.getConfig()?.fadeMs });
    }

    /** Switch playlists and restart scheduling. */
    enterMode(mode) {
        if (!mode || this.currentMode === mode) return false;
        const previousConfig = this.getConfig();
        this.currentMode = mode;
        if (this.active) this.start({ fadeMs: previousConfig?.fadeMs });
        return true;
    }

    /**
     * Play the next track immediately. Primarily used in tests to bypass
     * timers while still exercising track selection and fades.
     */
    playNextNow() {
        this.active = true;
        this.clearTimers();
        this.launchTrack();
    }

    getConfig(mode = this.currentMode) {
        return this.states[mode] || null;
    }

    clearTimers() {
        this.scheduler.clearAll();
    }

    scheduleNext(immediate = false, customDelay) {
        if (!this.active) return;
        const config = this.getConfig();
        if (!config) return;
        const delay = typeof customDelay === 'number'
            ? Math.max(0, customDelay)
            : (immediate ? this.randomizer.randomInitialDelay() : this.randomizer.randomSilence(config));
        this.scheduler.scheduleNext(() => this.launchTrack(), delay);
    }

    launchTrack() {
        const config = this.getConfig();
        if (!config) return;
        this.startBedsForMode(this.currentMode, config.fadeMs);
        const track = this.randomizer.pickTrack(this.currentMode, config.tracks);
        if (!track) {
            this.scheduleNext();
            return;
        }

        AudioDebugBus.reportIntent(track.key);

        // Stop whatever might be lingering before starting a fresh track.
        const transitionFade = Math.min(this.getFadeOutDuration(config, track), this.defaults.tailFadeMs);
        this.stopCurrent({ fadeMs: transitionFade });

        const handle = this.audioManager.playWithHandle(track.key, {
            allowOverlap: false,
            reset: true,
            loop: false,
            volume: typeof track.startVolume === 'number' ? track.startVolume : this.defaults.gentleStartVolume
        });
        if (!handle.attempted || !handle.node) {
            this.scheduleNext();
            return;
        }

        this.attachEndListeners(handle.node, config);
        this.activeHandle = {
            ...handle,
            targetVolume: track.volume ?? config.volume,
            fadeMs: this.getFadeInDuration(config, track),
            mode: this.currentMode,
            category: handle.category || 'music'
        };
        this.fadeTo(
            handle.node,
            this.activeHandle.targetVolume ?? handle.node.volume,
            this.activeHandle.fadeMs,
            typeof track.startVolume === 'number' ? track.startVolume : handle.node.volume,
            undefined,
            this.activeHandle.category
        );
    }

    attachEndListeners(node, config) {
        const maxMs = config.maxTrackMs || 90000;
        if (node && typeof node.addEventListener === 'function') {
            node.addEventListener('ended', () => this.handleTrackEnded());
        } else if (node) {
            node.onended = () => this.handleTrackEnded();
        }
        this.scheduler.scheduleFallback(() => this.handleTrackEnded('timeout'), maxMs);
    }

    handleTrackEnded(_reason = 'ended') {
        const config = this.getConfig();
        if (!config) return;
        this.scheduler.clearFallback();
        this.stopCurrent({ fadeMs: this.getFadeOutDuration(config) });
        this.scheduleNext(false, this.randomizer.randomSilence(config));
    }

    stopCurrent(options = {}) {
        if (!this.activeHandle || !this.activeHandle.node) return;
        const handleRef = this.activeHandle;
        const node = handleRef.node;
        this.scheduler.clearFallback();
        const fadeMs = Math.min(options.fadeMs ?? handleRef.fadeMs ?? 0, this.maxOverlapMs);
        if (fadeMs <= 0) {
            if (node.pause) node.pause();
            if (typeof node.currentTime === 'number') node.currentTime = 0;
            if (this.activeHandle === handleRef || this.activeHandle?.node === node) {
                this.activeHandle = null;
            }
            return;
        }
        this.fadeTo(node, 0, fadeMs, this.audioManager?.getBaseVolumeForNode?.(node), () => {
            if (node.pause) node.pause();
            if (typeof node.currentTime === 'number') node.currentTime = 0;
            if (this.activeHandle === handleRef || this.activeHandle?.node === node) {
                this.activeHandle = null;
            }
        }, handleRef.category || this.audioManager?.getNodeCategory?.(node));
    }

    fadeTo(node, targetVolume = 1, durationMs = 1000, startVolume = node.volume, onDone, category) {
        if (!node) return;
        const steps = Math.max(1, Math.floor(durationMs / 60));
        const resolvedCategory = category || this.audioManager?.getNodeCategory?.(node) || 'sfx';
        const baseStart = typeof startVolume === 'number'
            ? startVolume
            : this.audioManager?.getBaseVolumeForNode?.(node) ?? startVolume ?? 1;
        const baseTarget = typeof targetVolume === 'number' ? targetVolume : baseStart;
        this.audioManager?.updateTrackedBaseVolume?.(node, baseTarget);
        const scaledStart = this.audioManager?.getScaledVolume?.(baseStart, resolvedCategory) ?? baseStart;
        const scaledTarget = this.audioManager?.getScaledVolume?.(baseTarget, resolvedCategory) ?? baseTarget;
        const delta = (scaledTarget - scaledStart) / steps;
        let step = 0;

        const applyStep = () => {
            step += 1;
            const nextVol = Math.max(0, Math.min(1, scaledStart + delta * step));
            node.volume = nextVol;
            if (step >= steps) {
                this.scheduler.clearFade(node);
                if (onDone) onDone();
            }
        };

        if (durationMs <= 0) {
            node.volume = scaledTarget;
            if (onDone) onDone();
            return;
        }
        this.scheduler.scheduleFade(node, durationMs / steps, applyStep);
    }

    getFadeInDuration(config, track) {
        const candidate = track?.fadeMs ?? config?.fadeMs ?? this.defaults.fadeInMs;
        return Math.min(candidate, this.maxOverlapMs);
    }

    getFadeOutDuration(config, track) {
        const candidate = track?.fadeMs ?? config?.fadeMs ?? this.defaults.fadeOutMs;
        return Math.min(candidate, this.maxOverlapMs);
    }

    startBedsForMode(mode = this.currentMode, fadeMs) {
        if (!this.bedsEnabled) return;
        const config = this.getConfig(mode);
        if (!config?.beds?.length) {
            this.stopBeds({ fadeMs });
            return;
        }

        const keep = new Set();
        config.beds.forEach((bed) => {
            const handle = this.audioManager.playWithHandle(bed.key, {
                allowOverlap: false,
                loop: true,
                reset: false,
                volume: typeof bed.startVolume === 'number' ? bed.startVolume : bed.volume
            });
            if (!handle.attempted || !handle.node) return;

            const targetVolume = bed.volume ?? config.volume ?? this.defaults.gentleStartVolume;
            const fadeDuration = Math.min(bed.fadeMs ?? config.fadeMs ?? this.defaults.fadeInMs, this.maxOverlapMs);
            const bedCategory = handle.category
                || this.audioManager?.resolveCategory?.(bed.key, this.audioManager?.manifest?.[bed.key])
                || 'music';
            this.fadeTo(
                handle.node,
                targetVolume,
                fadeDuration,
                typeof bed.startVolume === 'number' ? bed.startVolume : handle.node.volume,
                undefined,
                bedCategory
            );

            this.activeBeds.set(bed.key, {
                ...handle,
                targetVolume,
                fadeMs: fadeDuration,
                category: bedCategory
            });
            keep.add(bed.key);
        });

        this.activeBeds.forEach((handle, key) => {
            if (keep.has(key)) return;
            this.fadeTo(
                handle.node,
                0,
                handle.fadeMs ?? fadeMs ?? this.defaults.fadeOutMs,
                this.audioManager?.getBaseVolumeForNode?.(handle.node),
                () => {
                if (handle.node.pause) handle.node.pause();
                if (typeof handle.node.currentTime === 'number') handle.node.currentTime = 0;
                this.activeBeds.delete(key);
            }, handle.category || this.audioManager?.getNodeCategory?.(handle.node));
        });
    }

    stopBeds(options = {}) {
        if (!this.activeBeds.size) return;
        const fadeMs = Math.min(options.fadeMs ?? this.defaults.fadeOutMs, this.maxOverlapMs);
        this.activeBeds.forEach((handle, key) => {
            if (fadeMs <= 0) {
                if (handle.node.pause) handle.node.pause();
                if (typeof handle.node.currentTime === 'number') handle.node.currentTime = 0;
                this.activeBeds.delete(key);
                return;
            }
            this.fadeTo(
                handle.node,
                0,
                fadeMs,
                this.audioManager?.getBaseVolumeForNode?.(handle.node),
                () => {
                    if (handle.node.pause) handle.node.pause();
                    if (typeof handle.node.currentTime === 'number') handle.node.currentTime = 0;
                    this.activeBeds.delete(key);
                },
                handle.category || this.audioManager?.getNodeCategory?.(handle.node)
            );
        });
    }
}

export { AMBIENT_DEFAULTS, AMBIENT_FEATURE_FLAGS, AmbientConductor, AmbientScheduler, AmbientRandomizer };
