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
    }

    /**
     * Retrieve (or lazily build) the primary audio element for a key.
     * Cached entries are reused unless overlap playback is requested.
     */
    getOrCreate(key) {
        if (this.cache.has(key)) return this.cache.get(key);
        const def = this.manifest[key];
        if (!def) return null;
        const node = this.createAudio(def.src);
        if (def.volume) node.volume = def.volume;
        if (typeof node.preload !== 'undefined') node.preload = 'auto';
        this.cache.set(key, node);
        return node;
    }

    /**
     * Play a sound effect by key, respecting cooldowns and overlap options.
     * Returns a boolean indicating whether playback was attempted.
     */
    play(key, options = {}) {
        const def = this.manifest[key];
        if (!def) return false;

        const now = Date.now();
        const cooldownMs = options.cooldownMs ?? def.cooldownMs;
        const last = this.lastPlayed.get(key) || 0;
        if (cooldownMs && now - last < cooldownMs) return false;

        const overlap = options.allowOverlap ?? def.allowOverlap;
        const loop = options.loop ?? def.loop;
        const reset = options.reset !== false;

        const base = this.getOrCreate(key);
        if (!base) return false;
        const useClone = overlap && this.lastPlayed.has(key) && base.cloneNode;
        const node = useClone ? base.cloneNode() : base;
        if (def.volume && node.volume !== def.volume) node.volume = def.volume;
        if (typeof loop !== 'undefined') node.loop = !!loop;
        if (reset && typeof node.currentTime === 'number') node.currentTime = 0;

        const promise = node.play ? node.play() : null;
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});

        this.lastPlayed.set(key, now);
        return true;
    }

    /**
     * Begin the configured ambient loop. Safe to call multiple times.
     */
    startAmbientLoop() {
        if (!this.ambientKey) return false;
        const base = this.getOrCreate(this.ambientKey);
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
        const node = this.cache.get(key) || null;
        if (!node) return false;
        if (node.pause) node.pause();
        if (typeof node.currentTime === 'number') node.currentTime = 0;
        return true;
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

const SFX_MANIFEST = {
    wardrum: { src: 'sfx/wardrum.mp3', cooldownMs: 1200 },
    sword: { src: 'sfx/sword.mp3', allowOverlap: true, cooldownMs: 90 },
    arrow: { src: 'sfx/arrow.mp3', allowOverlap: true, cooldownMs: 90 },
    defeat: { src: 'sfx/defeat.mp3', cooldownMs: 400 },
    city: { src: 'sfx/city.mp3', cooldownMs: 100 },
    choptree: { src: 'sfx/choptree.mp3', cooldownMs: 100 },
    ambient: { src: 'sfx/ambient.mp3', loop: true, volume: 0.35, isAmbient: true, cooldownMs: 0 }
};

const GameAudio = new AudioManager(SFX_MANIFEST);

if (typeof module !== 'undefined') {
    module.exports = { AudioManager, GameAudio, SFX_MANIFEST, defaultAudioFactory };
}
if (typeof window !== 'undefined') {
    window.AudioManager = AudioManager;
    window.GameAudio = GameAudio;
}
