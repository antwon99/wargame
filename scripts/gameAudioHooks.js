/**
 * Helpers for orchestrating the overworld ambient loop from both the game runtime
 * and automated tests.
 */
export function armAmbientLoop(windowRef = (typeof window !== 'undefined' ? window : undefined)) {
    if (!windowRef) return;
    windowRef.AmbientSoundscape?.enterMode?.('TERRITORY');
    windowRef.AmbientSoundscape?.start?.();
}

/** Stop ambiance when entering combat or pausing overworld exploration. */
export function haltAmbientLoop(windowRef = (typeof window !== 'undefined' ? window : undefined)) {
    if (!windowRef) return;
    windowRef.AmbientSoundscape?.stopAll?.();
}

// CommonJS compatibility for the lightweight test harness.
if (typeof module !== 'undefined') {
    module.exports = { armAmbientLoop, haltAmbientLoop };
}
