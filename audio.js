/**
 * Utility for picking weighted entries so audio variants can bias toward
 * certain takes while still keeping the mix fresh.
 */
class WeightedSelector {
    constructor(entries = []) {
        this.setEntries(entries);
    }

    /** Replace the weighted pool with a new list of entries. */
    setEntries(entries = []) {
        this.entries = entries.map((entry, idx) => ({
            weight: entry.weight ?? 1,
            ...entry,
            id: entry.id || entry.key || entry.src || `v${idx}`
        }));
        this.totalWeight = this.entries.reduce((sum, e) => sum + (e.weight || 0), 0);
        this.source = entries;
    }

    /**
     * Select an entry based on cumulative weight. Defaults to a fair pick
     * when weights are missing or zeroed out.
     * @param {Function} randomFn RNG returning [0,1).
     * @returns {object|null}
     */
    pick(randomFn = Math.random) {
        if (!this.entries.length) return null;
        if (!this.totalWeight) return this.entries[Math.floor(randomFn() * this.entries.length)];

        const target = randomFn() * this.totalWeight;
        let cursor = 0;
        for (const entry of this.entries) {
            cursor += entry.weight || 0;
            if (target <= cursor) return entry;
        }
        return this.entries[this.entries.length - 1];
    }
}

/**
 * AudioManager centralizes playback for UI and combat events.
 * It wraps HTMLAudioElement creation with cooldowns, loop helpers,
 * and Node-safe defaults so tests can validate behavior without a DOM.
 */
class AudioManager {
    /**
     * @param {Object<string, Object>} manifest mapping effect keys to {src, loop?, volume?, cooldownMs?, allowOverlap?}
     * @param {Object} options optional overrides
     * @param {Function} options.createAudio factory function for constructing audio-like objects
     * @param {string} options.ambientKey manifest key to treat as the ambient loop
     */
    constructor(manifest = {}, options = {}) {
        this.manifest = manifest;
        this.createAudio = options.createAudio || defaultAudioFactory;
        this.cache = new Map();
        this.lastPlayed = new Map();
        this.ambientKey = options.ambientKey || Object.keys(manifest).find((k) => manifest[k].isAmbient);
        this.random = options.random || Math.random;
        this.variantSelectors = new Map();
    }

    /**
     * Retrieve (or lazily build) the primary audio element for a specific
     * manifest variant key. Cached entries are reused unless overlap playback
     * is requested via `allowOverlap`.
     */
    getOrCreateNode(variantKey, def) {
        if (this.cache.has(variantKey)) return this.cache.get(variantKey);
        const node = this.createAudio(def.src);
        if (typeof def.volume !== 'undefined') node.volume = def.volume;
        if (typeof node.preload !== 'undefined') node.preload = 'auto';
        this.cache.set(variantKey, node);
        return node;
    }

    /**
     * Normalize manifest data into a concrete playback target, including
     * weighted variant selection when configured.
     */
    resolveForPlayback(key) {
        const def = this.manifest[key];
        if (!def) return null;

        const hasVariants = Array.isArray(def.variations) && def.variations.length > 0;
        if (!hasVariants) {
            return { variantKey: key, variantDef: { ...def } };
        }

        let selector = this.variantSelectors.get(key);
        if (!selector) {
            selector = new WeightedSelector(def.variations);
            this.variantSelectors.set(key, selector);
        }
        const choice = selector.pick(this.random);
        const merged = { ...def, ...choice };
        delete merged.variations;
        const variantKey = `${key}:${choice.id || choice.src}`;
        return { variantKey, variantDef: merged };
    }

    /**
     * Play a sound effect by key, respecting cooldowns and overlap options.
     * Returns a boolean indicating whether playback was attempted.
     */
    play(key, options = {}) {
        const result = this._playInternal(key, options, false);
        return result === true;
    }

    /**
     * Play a sound effect but also surface the underlying node/variant key for
     * systems (like the ambient conductor) that need to fade or schedule it.
     */
    playWithHandle(key, options = {}) {
        const result = this._playInternal(key, options, true);
        return result;
    }

    _playInternal(key, options, returnHandle) {
        const resolved = this.resolveForPlayback(key);
        if (!resolved) return returnHandle ? { attempted: false, node: null, variantKey: null } : false;

        const { variantKey, variantDef } = resolved;
        const now = Date.now();
        const cooldownMs = options.cooldownMs ?? variantDef.cooldownMs;
        const last = this.lastPlayed.get(key) || 0;
        if (cooldownMs && now - last < cooldownMs) return returnHandle ? { attempted: false, node: null, variantKey: null } : false;

        const overlap = options.allowOverlap ?? variantDef.allowOverlap;
        const loop = options.loop ?? variantDef.loop;
        const reset = options.reset !== false;
        const volume = options.volume ?? variantDef.volume;

        const base = this.getOrCreateNode(variantKey, variantDef);
        if (!base) return returnHandle ? { attempted: false, node: null, variantKey: null } : false;
        const useClone = overlap && this.lastPlayed.has(key) && base.cloneNode;
        const node = useClone ? base.cloneNode() : base;
        if (typeof volume !== 'undefined' && node.volume !== volume) node.volume = volume;
        if (typeof loop !== 'undefined') node.loop = !!loop;
        if (reset && typeof node.currentTime === 'number') node.currentTime = 0;

        const promise = node.play ? node.play() : null;
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});

        this.lastPlayed.set(key, now);
        if (returnHandle) return { attempted: true, node, variantKey };
        return true;
    }

    /**
     * Begin the configured ambient loop. Safe to call multiple times.
     */
    startAmbientLoop() {
        if (!this.ambientKey) return false;
        const resolved = this.resolveForPlayback(this.ambientKey);
        if (!resolved) return false;
        const base = this.getOrCreateNode(resolved.variantKey, resolved.variantDef);
        if (!base) return false;
        base.loop = true;
        if (typeof base.currentTime === 'number' && base.currentTime > 1) base.currentTime = 0;
        return this.play(this.ambientKey, { loop: true, reset: false });
    }

    /**
     * Stop playback for a specific key (ambient by default) and reset position.
     */
    stop(key = this.ambientKey) {
        if (!key) return false;
        let stopped = false;
        this.cache.forEach((node, cacheKey) => {
            if (cacheKey === key || cacheKey.startsWith(`${key}:`)) {
                if (node.pause) node.pause();
                if (typeof node.currentTime === 'number') node.currentTime = 0;
                stopped = true;
            }
        });
        return stopped;
    }

    /** Halt every cached audio node to keep war/overworld transitions quiet. */
    stopAll() {
        this.cache.forEach((node) => {
            if (node.pause) node.pause();
            if (typeof node.currentTime === 'number') node.currentTime = 0;
        });
    }
}

/** Build a resilient audio element, even when `Audio` is unavailable (tests). */
function defaultAudioFactory(src) {
    if (typeof Audio === 'undefined') {
        return {
            src,
            loop: false,
            currentTime: 0,
            volume: 1,
            play() { return Promise.resolve(); },
            pause() {},
            cloneNode() { return defaultAudioFactory(src); }
        };
    }
    return new Audio(src);
}

/**
 * Coordinates long-form ambience/music tracks with random delays and soft
 * crossfades so war/territory states feel alive without looping endlessly.
 */
class AmbientConductor {
    constructor(audioManager, options = {}) {
        this.audioManager = audioManager;
        this.random = options.random || Math.random;
        this.currentMode = options.initialMode || 'TERRITORY';
        this.states = options.states || {};
        this.maxOverlapMs = options.maxOverlapMs || 10000;
        this.scheduler = options.scheduler || {
            setTimeout: (...args) => setTimeout(...args),
            clearTimeout: (id) => clearTimeout(id),
            setInterval: (...args) => setInterval(...args),
            clearInterval: (id) => clearInterval(id)
        };
        this.trackSelectors = new Map();
        this.activeHandle = null;
        this.nextTimer = null;
        this.fallbackTimer = null;
        this.active = false;
        this.fadeIntervals = new Map();
    }

    /** Begin scheduling tracks for the current mode. Safe to call repeatedly. */
    start() {
        this.active = true;
        this.stopCurrent({ fadeMs: this.getConfig()?.fadeMs });
        this.clearTimers();
        this.scheduleNext(true);
        return true;
    }

    /** Immediately stop any playing music and pending timers. */
    stopAll() {
        this.active = false;
        this.clearTimers();
        this.stopCurrent({ fadeMs: this.getConfig()?.fadeMs });
    }

    /** Switch playlists and restart scheduling. */
    enterMode(mode) {
        if (!mode || this.currentMode === mode) return false;
        this.currentMode = mode;
        if (this.active) this.start();
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

    getConfig() {
        return this.states[this.currentMode] || null;
    }

    clearTimers() {
        if (this.nextTimer) this.scheduler.clearTimeout(this.nextTimer);
        this.fadeIntervals.forEach((intervalId) => this.scheduler.clearInterval(intervalId));
        this.fadeIntervals.clear();
        if (this.fallbackTimer) this.scheduler.clearTimeout(this.fallbackTimer);
        this.nextTimer = null;
        this.fallbackTimer = null;
    }

    scheduleNext(immediate = false, customDelay) {
        if (!this.active) return;
        const config = this.getConfig();
        if (!config) return;
        const delay = typeof customDelay === 'number'
            ? Math.max(0, customDelay)
            : (immediate ? 0 : this.randomSilence(config));
        this.nextTimer = this.scheduler.setTimeout(() => this.launchTrack(), delay);
    }

    launchTrack() {
        const config = this.getConfig();
        if (!config) return;
        const previousHandle = this.activeHandle;
        const track = this.pickTrack(config.tracks);
        if (!track) {
            this.scheduleNext();
            return;
        }

        const handle = this.audioManager.playWithHandle(track.key, {
            allowOverlap: true,
            reset: true,
            loop: false,
            volume: track.startVolume ?? 0
        });
        if (!handle.attempted || !handle.node) {
            this.scheduleNext();
            return;
        }

        this.attachEndListeners(handle.node, config);
        this.activeHandle = {
            ...handle,
            targetVolume: track.volume ?? config.volume,
            fadeMs: Math.min(track.fadeMs ?? config.fadeMs ?? 0, this.maxOverlapMs)
        };
        this.fadeTo(
            handle.node,
            this.activeHandle.targetVolume ?? handle.node.volume,
            this.activeHandle.fadeMs,
            typeof track.startVolume === 'number' ? track.startVolume : handle.node.volume
        );

        if (previousHandle?.node && previousHandle.node !== handle.node) {
            const fadeOutMs = Math.min(previousHandle.fadeMs ?? config.fadeMs ?? 0, this.maxOverlapMs);
            this.fadeTo(previousHandle.node, 0, fadeOutMs, previousHandle.node.volume, () => {
                if (previousHandle.node.pause) previousHandle.node.pause();
                if (typeof previousHandle.node.currentTime === 'number') previousHandle.node.currentTime = 0;
            });
        }
    }

    attachEndListeners(node, config) {
        const maxMs = config.maxTrackMs || 90000;
        if (node && typeof node.addEventListener === 'function') {
            node.addEventListener('ended', () => this.handleTrackEnded());
        } else if (node) {
            node.onended = () => this.handleTrackEnded();
        }
        this.fallbackTimer = this.scheduler.setTimeout(() => this.handleTrackEnded('timeout'), maxMs);
    }

    handleTrackEnded(reason = 'ended') {
        const config = this.getConfig();
        if (!config) return;
        const crossfade = this.random() < (config.crossfadeChance ?? 0);
        const delay = crossfade
            ? Math.min(config.overlapMs ?? config.fadeMs ?? 1200, config.fadeMs ?? 1200, this.maxOverlapMs)
            : this.randomSilence(config);
        this.stopCurrent({ fadeMs: config.fadeMs });
        this.scheduleNext(false, delay);
    }

    stopCurrent(options = {}) {
        if (!this.activeHandle || !this.activeHandle.node) return;
        const handleRef = this.activeHandle;
        const node = handleRef.node;
        const fadeMs = Math.min(options.fadeMs || 0, this.maxOverlapMs);
        if (fadeMs <= 0) {
            if (node.pause) node.pause();
            if (typeof node.currentTime === 'number') node.currentTime = 0;
            if (this.activeHandle === handleRef || this.activeHandle?.node === node) {
                this.activeHandle = null;
            }
            return;
        }
        this.fadeTo(node, 0, fadeMs, node.volume, () => {
            if (node.pause) node.pause();
            if (typeof node.currentTime === 'number') node.currentTime = 0;
            if (this.activeHandle === handleRef || this.activeHandle?.node === node) {
                this.activeHandle = null;
            }
        });
    }

    fadeTo(node, targetVolume = 1, durationMs = 1000, startVolume = node.volume, onDone) {
        if (!node) return;
        const steps = Math.max(1, Math.floor(durationMs / 60));
        const delta = (targetVolume - startVolume) / steps;
        let step = 0;

        const applyStep = () => {
            step += 1;
            const nextVol = Math.max(0, Math.min(1, startVolume + delta * step));
            node.volume = nextVol;
            if (step >= steps) {
                const intervalId = this.fadeIntervals.get(node);
                if (intervalId) this.scheduler.clearInterval(intervalId);
                this.fadeIntervals.delete(node);
                if (onDone) onDone();
            }
        };

        if (durationMs <= 0) {
            node.volume = targetVolume;
            if (onDone) onDone();
            return;
        }
        const existingInterval = this.fadeIntervals.get(node);
        if (existingInterval) this.scheduler.clearInterval(existingInterval);
        const intervalId = this.scheduler.setInterval(applyStep, durationMs / steps);
        this.fadeIntervals.set(node, intervalId);
    }

    randomSilence(config) {
        const [min, max] = config.silenceRangeMs || [12000, 22000];
        const span = Math.max(0, max - min);
        return min + Math.floor(this.random() * span);
    }

    pickTrack(tracks = []) {
        if (!tracks.length) return null;
        let selector = this.trackSelectors.get(this.currentMode);
        if (!selector || selector.source !== tracks) {
            selector = new WeightedSelector(tracks);
            this.trackSelectors.set(this.currentMode, selector);
        }
        return selector.pick(this.random);
    }
}

const SFX_MANIFEST = {
    wardrum: { src: 'sfx/wardrum.mp3', cooldownMs: 1200 },
    sword: {
        allowOverlap: true,
        cooldownMs: 90,
        variations: [
            { src: 'sfx/sword.mp3', weight: 2 },
            { src: 'sfx/sword2.mp3', weight: 1 },
            { src: 'sfx/sword3.mp3', weight: 1 },
            { src: 'sfx/sword4.mp3', weight: 1 },
            { src: 'sfx/sword5.mp3', weight: 1 }
        ]
    },
    arrow: {
        allowOverlap: true,
        cooldownMs: 90,
        variations: [
            { src: 'sfx/arrow.mp3', weight: 2 },
            { src: 'sfx/arrow2.mp3', weight: 1 },
            { src: 'sfx/arrow3.mp3', weight: 1 },
            { src: 'sfx/arrow4.mp3', weight: 1 }
        ]
    },
    tower: {
        allowOverlap: true,
        cooldownMs: 120,
        variations: [
            { src: 'sfx/tower.mp3', weight: 2 },
            { src: 'sfx/tower2.mp3', weight: 1 },
            { src: 'sfx/tower3.mp3', weight: 1 }
        ]
    },
    rare: {
        allowOverlap: true,
        cooldownMs: 140,
        variations: [
            { src: 'sfx/rare.mp3', weight: 2 },
            { src: 'sfx/rare2.mp3', weight: 1 },
            { src: 'sfx/rare3.mp3', weight: 1 }
        ]
    },
    defeat: { src: 'sfx/defeat.mp3', cooldownMs: 400 },
    victory: { src: 'sfx/victory.mp3', cooldownMs: 400 },
    city: { src: 'sfx/city.mp3', cooldownMs: 100 },
    choptree: { src: 'sfx/choptree.mp3', cooldownMs: 100 },
    ambient: { src: 'sfx/ambient.mp3', loop: true, volume: 0.35, isAmbient: true, cooldownMs: 0 },
    ambiance_upbeat: { src: 'sfx/ambiance_upbeat.mp3', volume: 0.55, cooldownMs: 0, allowOverlap: true },
    ambiance_uplifting: { src: 'sfx/ambiance_uplifting.mp3', volume: 0.55, cooldownMs: 0, allowOverlap: true },
    ambiance_sorrow: { src: 'sfx/ambiance_sorrow.mp3', volume: 0.6, cooldownMs: 0, allowOverlap: true },
    ambiance_dark: { src: 'sfx/ambiance_dark.mp3', volume: 0.6, cooldownMs: 0, allowOverlap: true }
};

const GameAudio = new AudioManager(SFX_MANIFEST);

const AMBIENT_STATES = {
    TERRITORY: {
        tracks: [
            { key: 'ambiance_upbeat', weight: 1, volume: 0.55 },
            { key: 'ambiance_uplifting', weight: 1, volume: 0.55 }
        ],
        silenceRangeMs: [20000, 42000],
        fadeMs: 2200,
        overlapMs: 1400,
        crossfadeChance: 0.38,
        maxTrackMs: 120000,
        volume: 0.55
    },
    WAR: {
        tracks: [
            { key: 'ambiance_sorrow', weight: 1, volume: 0.62 },
            { key: 'ambiance_dark', weight: 1, volume: 0.62 }
        ],
        silenceRangeMs: [12000, 30000],
        fadeMs: 2600,
        overlapMs: 1800,
        crossfadeChance: 0.5,
        maxTrackMs: 110000,
        volume: 0.62
    }
};

const AmbientSoundscape = new AmbientConductor(GameAudio, { initialMode: 'TERRITORY', states: AMBIENT_STATES });

if (typeof module !== 'undefined') {
    module.exports = { AudioManager, GameAudio, SFX_MANIFEST, defaultAudioFactory, WeightedSelector, AmbientConductor, AmbientSoundscape };
}
if (typeof window !== 'undefined') {
    window.AudioManager = AudioManager;
    window.GameAudio = GameAudio;
    window.AmbientSoundscape = AmbientSoundscape;
}
