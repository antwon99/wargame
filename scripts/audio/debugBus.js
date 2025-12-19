function createNoopBus() {
    return {
        enabled: false,
        sources: new Map(),
        intendedTrack: 'None',
        masterVolume: 1,
        boundNodes: new WeakSet(),
        reportIntent() {},
        registerPlayback() {},
        unregisterPlayback() {},
        snapshot() {
            return {
                intendedTrack: 'None',
                masterVolume: this.masterVolume,
                activeSources: []
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

function hydrateDebugBusIfNeeded() {
    if (!shouldEnableAudioDebugBus()) return;
    import('./debugBus.dev.js')
        .then(({ createAudioDebugBus, registerGlobalAudioDebugBus }) => {
            const realBus = createAudioDebugBus();
            Object.assign(AudioDebugBus, realBus, { enabled: true });
            registerGlobalAudioDebugBus(AudioDebugBus);
        })
        .catch(() => {});
}

hydrateDebugBusIfNeeded();

export { AudioDebugBus, shouldEnableAudioDebugBus };
