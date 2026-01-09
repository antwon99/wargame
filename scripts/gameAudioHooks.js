/**
 * Helpers for orchestrating the overworld ambient loop from both the game runtime
 * and automated tests.
 */
export function armAmbientLoop(windowRef = (typeof window !== 'undefined' ? window : undefined)) {
    if (!windowRef) return;
    windowRef.GameAudio?.startAmbientLoop?.();
    windowRef.AmbientSoundscape?.enterMode?.('TERRITORY');
    windowRef.AmbientSoundscape?.start?.();
}

/** Stop ambiance when entering combat or pausing overworld exploration. */
export function haltAmbientLoop(windowRef = (typeof window !== 'undefined' ? window : undefined)) {
    if (!windowRef) return;
    windowRef.AmbientSoundscape?.stopAll?.();
}
