/**
 * UI and audio glue for imperial mandate overlays.
 *
 * Provides shared guards so decree rendering does not clash with combat audio
 * and sanitizes UI bindings to keep mandate banners isolated from stingers.
 */
(function (global) {
    const UI_ONLY_AUDIO_GUARD = new Set(['wardrum']);

    /**
     * Shield decree/notification rendering from combat stingers so overlays stay UI-focused.
     * @param {Function} fn callback to execute while the guard is active.
     * @returns {*} return value from the guarded callback.
     */
    function withImperialAudioGuard(fn) {
        const audio = global.GameAudio || (typeof window !== 'undefined' ? window.GameAudio : null);
        if (audio?.runWithUiGuard) return audio.runWithUiGuard(fn);
        return typeof fn === 'function' ? fn() : null;
    }

    /**
     * Prevent decree presenters from invoking overlap-prone combat cues so messaging remains UI-only.
     * @param {object} [uiBindings] hooks that may include a playSound delegate.
     * @returns {object} shallow copy with guarded audio hooks.
     */
    function sanitizeUIBindings(uiBindings = {}) {
        if (!uiBindings || typeof uiBindings !== 'object') return {};
        if (typeof uiBindings.playSound !== 'function') return uiBindings;

        const safeBindings = { ...uiBindings };
        const originalPlay = uiBindings.playSound;
        safeBindings.playSound = (key, options) => {
            if (!key || UI_ONLY_AUDIO_GUARD.has(key)) return null;
            return originalPlay(key, options);
        };
        return safeBindings;
    }

    const api = { UI_ONLY_AUDIO_GUARD, withImperialAudioGuard, sanitizeUIBindings };

    global.MandateUiAdapters = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
