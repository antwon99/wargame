function createNoopBus() {
    return {
        enabled: false,
        sources: new Map(),
        intendedTrack: 'None',
        masterVolume: 1,
        boundNodes: new WeakSet(),
        blockedPlays: [],
        reportIntent() {},
        registerPlayback() {},
        unregisterPlayback() {},
        reportPlaybackFailure() {},
        snapshot() {
            return {
                intendedTrack: 'None',
                masterVolume: this.masterVolume,
                activeSources: [],
                blockedPlays: []
            };
        }
    };
}

/** Determine whether the debug bus should be hydrated for the current runtime. */
function shouldEnableAudioDebugBus() {
    const envToggle = typeof process !== 'undefined' && process?.env?.AUDIO_DEBUG_BUS === 'true';
    const windowToggle = typeof window !== 'undefined'
        && (window.DebugToggles?.audioDebugBus === true || window.DebugToggles?.enableAudioDebugBus === true);
    return Boolean(envToggle || windowToggle);
}

const AudioDebugBus = createNoopBus();

let hydratePromise = null;

/**
 * Re-check runtime toggles and load the full debug bus implementation when enabled.
 * @returns {Promise<Object>} Promise that resolves to the hydrated audio debug bus.
 */
function hydrateDebugBus() {
    if (AudioDebugBus.enabled) return Promise.resolve(AudioDebugBus);
    if (!shouldEnableAudioDebugBus()) return Promise.resolve(AudioDebugBus);
    return enableAudioDebugBus();
}

/**
 * Explicitly load the full audio debug bus and register it globally for overlays.
 * @returns {Promise<Object>} Promise that resolves to the hydrated audio debug bus.
 */
function enableAudioDebugBus() {
    if (AudioDebugBus.enabled) return Promise.resolve(AudioDebugBus);
    if (hydratePromise) return hydratePromise;

    hydratePromise = import('./debugBus.dev.js')
        .then(({ createAudioDebugBus, registerGlobalAudioDebugBus }) => {
            const realBus = createAudioDebugBus();
            Object.assign(AudioDebugBus, realBus, { enabled: true });
            registerGlobalAudioDebugBus(AudioDebugBus);
            return AudioDebugBus;
        })
        .catch(() => AudioDebugBus)
        .finally(() => {
            hydratePromise = null;
        });

    return hydratePromise;
}

hydrateDebugBus();

export { AudioDebugBus, enableAudioDebugBus, hydrateDebugBus, shouldEnableAudioDebugBus };
