import { AudioDebugBus } from './debugBus.js';
import { clampVolume, WeightedSelector } from './selectors.js';

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

/**
 * Immediately pivot the soundtrack into combat mode: silence whatever ambience is
 * currently playing and trigger the wardrum stinger without waiting for slow fades.
 *
 * @param {AudioManager} audioManager optional override for tests
 * @param {import('./ambient.js').AmbientConductor} ambient optional override for tests
 */
function enterCombat(audioManager, ambient) {
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
 * @param {import('./ambient.js').AmbientConductor} ambient optional override for tests
 */
function exitCombat(outcome, audioManager, ambient) {
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

export { AudioManager, attachCombatStingerGuards, defaultAudioFactory, enterCombat, exitCombat };
