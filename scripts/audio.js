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

/** Clamp arbitrary volume values into the [0,1] range with a sane fallback. */
function clampVolume(value, fallback = 1) {
    const numeric = Number.isFinite(value) ? value : fallback;
    return Math.max(0, Math.min(1, numeric));
}

// === AUDIO DEBUG BUS (diagnostic-only; remove after triage) ===
const AudioDebugBus = {
    enabled: true,
    sources: new Map(),
    intendedTrack: 'None',
    masterVolume: 1,
    boundNodes: new WeakSet(),
    reportIntent(name) {
        if (!this.enabled) return;
        this.intendedTrack = name || 'Unknown';
    },
    registerPlayback(node, meta = {}) {
        if (!this.enabled || !node) return;
        const label = meta.src ? meta.src.split('/').pop() : (meta.key || 'unknown');
        this.sources.set(node, { ...meta, label });

        const cleanup = () => this.unregisterPlayback(node);
        if (typeof node.addEventListener === 'function' && !this.boundNodes.has(node)) {
            node.addEventListener('ended', cleanup);
            node.addEventListener('pause', cleanup);
            this.boundNodes.add(node);
        } else if (!node.onended) {
            node.onended = cleanup;
        }
    },
    unregisterPlayback(node) {
        if (!node) return;
        this.sources.delete(node);
    },
    snapshot() {
        return {
            intendedTrack: this.intendedTrack,
            masterVolume: this.masterVolume,
            activeSources: Array.from(this.sources.values())
        };
    }
};
if (typeof window !== 'undefined') window.AudioDebugBus = AudioDebugBus;

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
        this.masterVolume = clampVolume(options.masterVolume ?? 1);
        this.categoryVolumes = {
            music: clampVolume(options.musicVolume ?? 1),
            sfx: clampVolume(options.sfxVolume ?? 1)
        };
        this.liveNodes = new Map();
        AudioDebugBus.masterVolume = this.masterVolume;
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

    /**
     * Determine which mixer category a manifest entry belongs to so sliders can
     * scale ambience (music) independently from sound effects.
     * @param {string} key manifest key being played
     * @param {Object} variantDef resolved manifest definition
     * @returns {('music'|'sfx')} resolved mixer category
     */
    resolveCategory(key, variantDef = {}) {
        if (variantDef.category === 'music' || variantDef.isAmbient) return 'music';
        const manifestCategory = this.manifest[key]?.category;
        return manifestCategory === 'music' ? 'music' : 'sfx';
    }

    /**
     * Clamp and apply the current mixer gains to a requested base volume.
     * @param {number} baseVolume unscaled volume value from the manifest or caller
     * @param {('music'|'sfx')} category mixer channel to use for scaling
     * @returns {number} clamped, scaled volume ready to assign to an audio node
     */
    getScaledVolume(baseVolume = 1, category = 'sfx') {
        const categoryVolume = this.categoryVolumes[category] ?? 1;
        return clampVolume(baseVolume * this.masterVolume * categoryVolume);
    }

    /**
     * Track a live audio node so mixer changes can refresh volumes mid-playback.
     * @param {HTMLAudioElement|object} node audio node to track
     * @param {('music'|'sfx')} category mixer channel the node belongs to
     * @param {number} baseVolume unscaled volume used when playback started
     */
    trackNode(node, category = 'sfx', baseVolume = 1) {
        if (!node) return;
        this.liveNodes.set(node, { category, baseVolume });
        const cleanup = () => { this.liveNodes.delete(node); };
        if (typeof node.addEventListener === 'function') {
            node.addEventListener('ended', cleanup);
            node.addEventListener('pause', cleanup);
        } else if (!node.onended) {
            node.onended = cleanup;
        }
    }

    /** Update the tracked base volume for a node so future mixer refreshes stay accurate. */
    updateTrackedBaseVolume(node, baseVolume) {
        if (!node) return;
        const existing = this.liveNodes.get(node) || { category: 'sfx', baseVolume };
        this.liveNodes.set(node, { ...existing, baseVolume });
        node.__baseVolume = baseVolume;
    }

    /** Retrieve the base (unscaled) volume used for a node. */
    getBaseVolumeForNode(node) {
        if (!node) return 1;
        return this.liveNodes.get(node)?.baseVolume ?? node.__baseVolume ?? node.volume ?? 1;
    }

    /** Resolve the mixer category for a live node. */
    getNodeCategory(node) {
        return this.liveNodes.get(node)?.category || 'sfx';
    }

    /** Re-apply the current mixer values to every tracked node. */
    applyVolumeMix() {
        this.liveNodes.forEach((meta, node) => {
            const baseVolume = typeof meta.baseVolume === 'number' ? meta.baseVolume : this.getBaseVolumeForNode(node);
            node.volume = this.getScaledVolume(baseVolume, meta.category);
        });
        AudioDebugBus.masterVolume = this.masterVolume;
    }

    /**
     * Update the master gain slider and refresh all tracked nodes.
     * @param {number} value desired master volume (0–1)
     * @returns {number} resulting master volume
     */
    setMasterVolume(value) {
        this.masterVolume = clampVolume(value, this.masterVolume);
        this.applyVolumeMix();
        return this.masterVolume;
    }

    /**
     * Update the music channel volume and refresh live music tracks.
     * @param {number} value desired music volume (0–1)
     * @returns {number} resulting music volume
     */
    setMusicVolume(value) {
        this.categoryVolumes.music = clampVolume(value, this.categoryVolumes.music);
        this.applyVolumeMix();
        return this.categoryVolumes.music;
    }

    /**
     * Update the sound effects channel volume and refresh live effects.
     * @param {number} value desired sfx volume (0–1)
     * @returns {number} resulting sfx volume
     */
    setSfxVolume(value) {
        this.categoryVolumes.sfx = clampVolume(value, this.categoryVolumes.sfx);
        this.applyVolumeMix();
        return this.categoryVolumes.sfx;
    }

    /** Surface the current mixer snapshot for UI bindings and debug overlays. */
    getVolumeSnapshot() {
        return {
            master: this.masterVolume,
            music: this.categoryVolumes.music,
            sfx: this.categoryVolumes.sfx
        };
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
        const category = this.resolveCategory(key, variantDef);
        const baseVolume = typeof volume === 'number'
            ? volume
            : (typeof variantDef.volume === 'number' ? variantDef.volume : node.volume);
        node.__baseVolume = baseVolume;
        this.trackNode(node, category, baseVolume);
        const scaledVolume = this.getScaledVolume(baseVolume, category);
        if (typeof volume !== 'undefined' || node.volume !== scaledVolume) node.volume = scaledVolume;
        if (typeof loop !== 'undefined') node.loop = !!loop;
        if (reset && typeof node.currentTime === 'number') node.currentTime = 0;

        AudioDebugBus.registerPlayback(node, { key, variantKey, src: variantDef.src });

        const promise = node.play ? node.play() : null;
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});

        this.lastPlayed.set(key, now);
        if (returnHandle) return { attempted: true, node, variantKey, category, baseVolume };
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
        this.bedsEnabled = options.bedsEnabled ?? AMBIENT_FEATURE_FLAGS.bedsEnabled;
        this.scheduler = options.scheduler || {
            setTimeout: (...args) => setTimeout(...args),
            clearTimeout: (id) => clearTimeout(id),
            setInterval: (...args) => setInterval(...args),
            clearInterval: (id) => clearInterval(id)
        };
        this.trackSelectors = new Map();
        this.activeHandle = null;
        this.activeBeds = new Map();
        this.nextTimer = null;
        this.fallbackTimer = null;
        this.active = false;
        this.fadeIntervals = new Map();
        this.defaults = { ...AMBIENT_DEFAULTS, ...(options.defaults || {}) };
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
            : (immediate ? this.randomInitialDelay() : this.randomSilence(config));
        this.nextTimer = this.scheduler.setTimeout(() => this.launchTrack(), delay);
    }

    launchTrack() {
        const config = this.getConfig();
        if (!config) return;
        this.startBedsForMode(this.currentMode, config.fadeMs);
        const previousHandle = this.activeHandle;
        const track = this.pickTrack(config.tracks);
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
        this.fallbackTimer = this.scheduler.setTimeout(() => this.handleTrackEnded('timeout'), maxMs);
    }

    handleTrackEnded(reason = 'ended') {
        const config = this.getConfig();
        if (!config) return;
        if (this.fallbackTimer) {
            this.scheduler.clearTimeout(this.fallbackTimer);
            this.fallbackTimer = null;
        }
        this.stopCurrent({ fadeMs: this.getFadeOutDuration(config) });
        this.scheduleNext(false, this.randomSilence(config));
    }

    stopCurrent(options = {}) {
        if (!this.activeHandle || !this.activeHandle.node) return;
        const handleRef = this.activeHandle;
        const node = handleRef.node;
        if (this.fallbackTimer) {
            this.scheduler.clearTimeout(this.fallbackTimer);
            this.fallbackTimer = null;
        }
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
                const intervalId = this.fadeIntervals.get(node);
                if (intervalId) this.scheduler.clearInterval(intervalId);
                this.fadeIntervals.delete(node);
                if (onDone) onDone();
            }
        };

        if (durationMs <= 0) {
            node.volume = scaledTarget;
            if (onDone) onDone();
            return;
        }
        const existingInterval = this.fadeIntervals.get(node);
        if (existingInterval) this.scheduler.clearInterval(existingInterval);
        const intervalId = this.scheduler.setInterval(applyStep, durationMs / steps);
        this.fadeIntervals.set(node, intervalId);
    }

    randomSilence(config) {
        const [min, max] = config.silenceRangeMs || [this.defaults.minSilenceMs, this.defaults.maxSilenceMs];
        const span = Math.max(0, max - min);
        return min + Math.floor(this.random() * span);
    }

    randomInitialDelay() {
        const [min, max] = this.defaults.initialDelayRangeMs;
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

const SFX_GROUPS = {
    ambientLoops: ['sfx/ambient/ambient.mp3'],
    // Wind bed intentionally disabled until a distinct loop is available to avoid
    // stacking the same ambience twice.
    windBeds: [],
    wardrums: ['sfx/system/wardrum.mp3'],
    city: ['sfx/territory/city.mp3'],
    swords: [
        { src: 'sfx/combat/sword/sword.mp3', weight: 2 },
        { src: 'sfx/combat/sword/sword2.mp3', weight: 1 },
        { src: 'sfx/combat/sword/sword3.mp3', weight: 1 },
        { src: 'sfx/combat/sword/sword4.mp3', weight: 1 },
        { src: 'sfx/combat/sword/sword5.mp3', weight: 1 }
    ],
    arrows: [
        { src: 'sfx/combat/arrow/arrow.mp3', weight: 2 },
        { src: 'sfx/combat/arrow/arrow2.mp3', weight: 1 },
        { src: 'sfx/combat/arrow/arrow3.mp3', weight: 1 },
        { src: 'sfx/combat/arrow/arrow4.mp3', weight: 1 }
    ],
    towers: [
        { src: 'sfx/combat/tower/tower.mp3', weight: 2 },
        { src: 'sfx/combat/tower/tower2.mp3', weight: 1 },
        { src: 'sfx/combat/tower/tower3.mp3', weight: 1 }
    ],
    rares: [
        { src: 'sfx/ui/rare.mp3', weight: 2 },
        { src: 'sfx/ui/rare2.mp3', weight: 1 },
        { src: 'sfx/ui/rare3.mp3', weight: 1 }
    ],
    victory: ['sfx/system/victory.mp3'],
    defeat: ['sfx/system/defeat.mp3'],
    territoryMusic: [
        'sfx/ambient/ambiance_upbeat.mp3',
        'sfx/ambient/ambiance_uplifting.mp3'
    ],
    warMusic: [
        'sfx/ambient/ambiance_sorrow.mp3',
        'sfx/ambient/ambiance_dark.mp3'
    ],
    /**
     * Choptree straddles UI feedback and resource collection but currently
     * lives alongside other territory cues to keep surface interactions
     * bundled together.
     */
    misc: ['sfx/territory/choptree.mp3']
};

const SFX_MANIFEST = {
    wardrum: { src: SFX_GROUPS.wardrums[0], cooldownMs: 1200 },
    sword: {
        allowOverlap: true,
        cooldownMs: 90,
        variations: SFX_GROUPS.swords
    },
    arrow: {
        allowOverlap: true,
        cooldownMs: 90,
        variations: SFX_GROUPS.arrows
    },
    tower: {
        allowOverlap: true,
        cooldownMs: 120,
        variations: SFX_GROUPS.towers
    },
    rare: {
        allowOverlap: true,
        cooldownMs: 140,
        variations: SFX_GROUPS.rares
    },
    defeat: { src: SFX_GROUPS.defeat[0], cooldownMs: 400 },
    victory: { src: SFX_GROUPS.victory[0], cooldownMs: 400 },
    city: { src: SFX_GROUPS.city[0], cooldownMs: 100 },
    choptree: { src: SFX_GROUPS.misc[0], cooldownMs: 100 },
    ambient: { src: SFX_GROUPS.ambientLoops[0], loop: true, volume: 0.35, isAmbient: true, cooldownMs: 0, category: 'music' },
    ambiance_upbeat: { src: SFX_GROUPS.territoryMusic[0], volume: 0.55, cooldownMs: 0, allowOverlap: true, category: 'music' },
    ambiance_uplifting: { src: SFX_GROUPS.territoryMusic[1], volume: 0.55, cooldownMs: 0, allowOverlap: true, category: 'music' },
    ambiance_sorrow: { src: SFX_GROUPS.warMusic[0], volume: 0.6, cooldownMs: 0, allowOverlap: true, category: 'music' },
    ambiance_dark: { src: SFX_GROUPS.warMusic[1], volume: 0.6, cooldownMs: 0, allowOverlap: true, category: 'music' }
};

const COMBAT_STINGERS = new Set(['wardrum']);

/**
 * Wrap an audio manager with UI-aware guards so combat stingers (wardrum) only
 * fire when explicitly permitted. The guards prevent decree/notification
 * presenters from stomping ambient playback or firing combat cues.
 * @param {AudioManager} manager audio manager instance to protect.
 * @returns {AudioManager} guarded manager reference for chaining.
 */
function attachCombatStingerGuards(manager) {
    if (!manager) return manager;

    const guardState = { uiOverlayActive: false, allowCombatStinger: false };
    const shouldBlockStinger = (key) => COMBAT_STINGERS.has(key)
        && (!guardState.allowCombatStinger || guardState.uiOverlayActive);

    const basePlay = manager.play.bind(manager);
    manager.play = (key, options = {}) => {
        if (shouldBlockStinger(key)) return false;
        return basePlay(key, options);
    };

    const basePlayWithHandle = manager.playWithHandle.bind(manager);
    manager.playWithHandle = (key, options = {}) => {
        if (shouldBlockStinger(key)) return { attempted: false, node: null, variantKey: null };
        return basePlayWithHandle(key, options);
    };

    manager.setUiOverlayGuard = (active) => { guardState.uiOverlayActive = !!active; };
    manager.runWithUiGuard = (fn) => {
        manager.setUiOverlayGuard(true);
        try {
            return typeof fn === 'function' ? fn() : null;
        } finally {
            manager.setUiOverlayGuard(false);
        }
    };
    manager.allowCombatStingerOnce = (fn) => {
        guardState.allowCombatStinger = true;
        try {
            return typeof fn === 'function' ? fn() : null;
        } finally {
            guardState.allowCombatStinger = false;
        }
    };

    return manager;
}

const GameAudio = attachCombatStingerGuards(new AudioManager(SFX_MANIFEST));

const AMBIENT_STATES = {
    TERRITORY: {
        tracks: [
            { key: 'ambiance_upbeat', weight: 1, volume: 0.55 },
            { key: 'ambiance_uplifting', weight: 1, volume: 0.55 }
        ],
        beds: [],
        silenceRangeMs: [14000, 42000],
        fadeMs: 1600,
        maxTrackMs: 120000,
        volume: 0.55
    },
    WAR: {
        tracks: [
            { key: 'ambiance_sorrow', weight: 1, volume: 0.62 },
            { key: 'ambiance_dark', weight: 1, volume: 0.62 }
        ],
        beds: [],
        silenceRangeMs: [12000, 36000],
        fadeMs: 1800,
        maxTrackMs: 110000,
        volume: 0.62
    }
};

const AmbientSoundscape = new AmbientConductor(GameAudio, { initialMode: 'TERRITORY', states: AMBIENT_STATES });

/**
 * Immediately pivot the soundtrack into combat mode: silence whatever ambience is
 * currently playing and trigger the wardrum stinger without waiting for slow fades.
 *
 * @param {AudioManager} audioManager optional override for tests
 * @param {AmbientConductor} ambient optional override for tests
 */
function enterCombat(audioManager = GameAudio, ambient = AmbientSoundscape) {
    if (ambient?.stopCurrent) ambient.stopCurrent({ fadeMs: 0 });
    if (ambient?.clearTimers) ambient.clearTimers();
    ambient?.enterMode?.('WAR');
    ambient?.start?.({ fadeMs: 0 });

    // Fire the war stinger immediately so players hear an instant transition.
    audioManager?.startAmbientLoop?.();
    if (typeof audioManager?.allowCombatStingerOnce === 'function') {
        audioManager.allowCombatStingerOnce(() => audioManager.play('wardrum', { allowOverlap: true, reset: true }));
    } else {
        audioManager?.play?.('wardrum', { allowOverlap: true, reset: true });
    }
}

/**
 * Return to overworld ambience after combat and play the appropriate resolution
 * sting so battles feel conclusive.
 *
 * @param {('victory'|'defeat'|'retreat'|string)} outcome battle result hint
 * @param {AudioManager} audioManager optional override for tests
 * @param {AmbientConductor} ambient optional override for tests
 */
function exitCombat(outcome, audioManager = GameAudio, ambient = AmbientSoundscape) {
    const label = (outcome || '').toLowerCase();
    if (label === 'victory') {
        audioManager?.play?.('victory');
    } else if (label === 'defeat' || label === 'retreat') {
        audioManager?.play?.('defeat');
    }

    // Ensure war ambience winds down and the overworld playlist resumes.
    ambient?.enterMode?.('TERRITORY');
    ambient?.start?.({ fadeMs: 0 });
}

if (typeof module !== 'undefined') {
    module.exports = { AudioManager, GameAudio, SFX_GROUPS, SFX_MANIFEST, defaultAudioFactory, WeightedSelector, AmbientConductor, AmbientSoundscape, AudioDebugBus, enterCombat, exitCombat, attachCombatStingerGuards };
}
if (typeof window !== 'undefined') {
    window.AudioManager = AudioManager;
    window.GameAudio = GameAudio;
    window.AmbientSoundscape = AmbientSoundscape;
    window.SFX_GROUPS = SFX_GROUPS;
    window.enterCombat = enterCombat;
    window.exitCombat = exitCombat;
}
