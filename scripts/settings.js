import { FOG_VISUAL_CONFIG } from './fogVisualConfig.mjs';

/** Clamp normalized slider values (0–1) while tolerating NaN input. */
function clamp01(value, fallback = 1) {
    const numeric = Number.isFinite(value) ? value : fallback;
    return Math.max(0, Math.min(1, numeric));
}

/** Build the baseline settings that mirror default audio/visual presentation. */
export function buildDefaultSettings() {
    return {
        audio: { master: 1, music: 1, sfx: 1 },
        visuals: {
            enabled: true,
            tileFogEnabled: FOG_VISUAL_CONFIG.tileFogEnabled === true,
            ambienceLayersEnabled: FOG_VISUAL_CONFIG.ambienceLayersEnabled === true,
            ambienceEnabled: FOG_VISUAL_CONFIG.ambienceEnabled !== false
        }
    };
}

/**
 * Lightweight event emitter so the settings service can broadcast changes
 * without depending on a DOM EventTarget (which is unavailable in tests).
 */
function createEmitter() {
    const listeners = new Map();
    return {
        /** Register a listener for the given event name. */
        on(event, handler) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(handler);
            return () => listeners.get(event)?.delete(handler);
        },
        /** Dispatch an event payload to all subscribers. */
        emit(event, payload) {
            if (!listeners.has(event)) return;
            listeners.get(event).forEach((handler) => {
                try { handler(payload); } catch (_) { /* swallow */ }
            });
        }
    };
}

/**
 * Encapsulates load/save behavior and runtime application hooks for
 * player-facing audio + visual preferences.
 * @param {Object} options dependency + configuration bundle.
 * @param {string} [options.storageKey] persisted storage key for snapshots.
 * @param {Storage|null} [options.storage] persistence layer (localStorage or stub).
 * @param {Object} [options.defaults] baseline settings bundle.
 * @param {Function} [options.audioAdapter] invoked with normalized audio settings when they change.
 * @param {Function} [options.visualAdapter] invoked with normalized visual settings when they change.
 * @param {Function} [options.onError] optional error reporter for parse/persist failures.
 * @returns {Object} settings service with load/save/apply helpers and an `on` subscription API.
 */
export function createSettingsService(options = {}) {
    const {
        storageKey = 'wargame:player-settings',
        storage = typeof window !== 'undefined' ? window.localStorage : null,
        defaults = buildDefaultSettings(),
        audioAdapter = () => {},
        visualAdapter = () => {},
        onError = () => {}
    } = options;

    const emitter = createEmitter();
    let state = { ...defaults };

    const getSnapshot = () => ({
        audio: { ...defaults.audio, ...(state.audio || {}) },
        visuals: { ...defaults.visuals, ...(state.visuals || {}) }
    });

    const persist = (settings) => {
        if (!storage) return settings;
        try {
            storage.setItem(storageKey, JSON.stringify(settings));
        } catch (error) {
            onError('settings persist', error);
        }
        return settings;
    };

    return {
        defaults,
        /**
         * Subscribe to settings events. Supported events: `change`, `audio`, `visual`.
         * @param {string} event event name.
         * @param {Function} handler callback invoked with the latest payload.
         * @returns {Function} unsubscribe handle.
         */
        on: (event, handler) => emitter.on(event, handler),
        /**
         * Load the persisted settings snapshot (if available) and merge it with defaults.
         * Emits a `change` event with the resolved bundle.
         * @returns {Object} normalized settings bundle.
         */
        load() {
            if (!storage) {
                state = { ...defaults };
                emitter.emit('change', getSnapshot());
                return getSnapshot();
            }
            const raw = storage.getItem(storageKey);
            if (!raw) {
                state = { ...defaults };
                emitter.emit('change', getSnapshot());
                return getSnapshot();
            }
            try {
                const parsed = JSON.parse(raw);
                state = {
                    audio: { ...defaults.audio, ...(parsed.audio || {}) },
                    visuals: { ...defaults.visuals, ...(parsed.visuals || {}) }
                };
            } catch (error) {
                onError('settings parse', error);
                state = { ...defaults };
            }
            const snapshot = getSnapshot();
            emitter.emit('change', snapshot);
            return snapshot;
        },
        /**
         * Persist the provided snapshot (or current state) without applying it.
         * @param {Object} [settings] snapshot to write to storage.
         * @returns {Object} persisted snapshot.
         */
        save(settings) {
            const snapshot = settings || getSnapshot();
            state = { ...snapshot };
            return persist(snapshot);
        },
        /**
         * Merge and apply audio settings, clamp them to 0–1, persist, and emit events.
         * @param {Object} audioSettings partial audio payload.
         * @returns {Object} normalized audio settings.
         */
        applyAudio(audioSettings = {}) {
            const merged = { ...getSnapshot().audio, ...(audioSettings || {}) };
            const normalized = {
                master: clamp01(merged.master, defaults.audio.master),
                music: clamp01(merged.music, defaults.audio.music),
                sfx: clamp01(merged.sfx, defaults.audio.sfx)
            };
            state = { ...getSnapshot(), audio: normalized };
            audioAdapter(normalized);
            persist(state);
            emitter.emit('audio', normalized);
            emitter.emit('change', getSnapshot());
            return normalized;
        },
        /**
         * Merge and apply visual settings, coerce booleans, persist, and emit events.
         * @param {Object} visualSettings partial visual payload.
         * @returns {Object} normalized visual settings.
         */
        applyVisual(visualSettings = {}) {
            const merged = { ...getSnapshot().visuals, ...(visualSettings || {}) };
            const normalized = {
                enabled: merged.enabled !== false,
                tileFogEnabled: merged.tileFogEnabled === true,
                ambienceLayersEnabled: merged.ambienceLayersEnabled === true,
                ambienceEnabled: merged.ambienceEnabled !== false
            };
            state = { ...getSnapshot(), visuals: normalized };
            visualAdapter(normalized);
            persist(state);
            emitter.emit('visual', normalized);
            emitter.emit('change', getSnapshot());
            return normalized;
        },
        /** Retrieve the current settings snapshot merged with defaults. */
        getSnapshot
    };
}
