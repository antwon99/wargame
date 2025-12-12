/**
 * Helpers for orchestrating the overworld ambient loop from both the game runtime
 * and automated tests.
 */
export function armAmbientLoop(windowRef = (typeof window !== 'undefined' ? window : undefined)) {
    if (!windowRef) return;
    windowRef.GameAudio?.startAmbientLoop?.();
    windowRef.AmbientSoundscape?.enterMode?.('TERRITORY');
    windowRef.AmbientSoundscape?.start?.();
    windowRef.AudioDebugBus?.reportAmbientState?.('TERRITORY');
}

/** Stop ambiance when entering combat or pausing overworld exploration. */
export function haltAmbientLoop(windowRef = (typeof window !== 'undefined' ? window : undefined)) {
    if (!windowRef) return;
    if (windowRef.Game) windowRef.Game.ambientLoopStarted = false;
    windowRef.GameAudio?.stop?.(windowRef.GameAudio?.ambientKey);
    windowRef.GameAudio?.stop?.();
    windowRef.AmbientSoundscape?.stopAll?.();
    windowRef.AudioDebugBus?.reportAmbientState?.('HALTED');
}

/**
 * Single entry point for syncing ambience with the current gameplay state so
 * overlapping war/overworld mixes do not pile up during rapid toggles.
 * @param {string} state target game state (OVERWORLD|COMBAT)
 * @param {Object} options optional controls
 * @param {string} [options.outcome] battle outcome label for overworld returns
 * @param {object} windowRef window-like host (for tests)
 */
export function syncAmbientForState(
    state,
    options = {},
    windowRef = (typeof window !== 'undefined' ? window : undefined)
) {
    if (!windowRef) return;
    const normalized = (state || '').toUpperCase();

    haltAmbientLoop(windowRef);

    if (normalized === 'COMBAT') {
        windowRef.AudioDebugBus?.reportAmbientState?.('COMBAT');
        windowRef.enterCombat?.();
        return;
    }

    windowRef.exitCombat?.(options.outcome);
    windowRef.GameAudio?.startAmbientLoop?.();
    if (windowRef.Game) windowRef.Game.ambientLoopStarted = true;
    windowRef.AudioDebugBus?.reportAmbientState?.('OVERWORLD');
}

// CommonJS compatibility for the lightweight test harness.
if (typeof module !== 'undefined') {
    module.exports = { armAmbientLoop, haltAmbientLoop, syncAmbientForState };
}
