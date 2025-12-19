/**
 * Lightweight adapter surface shared by the mandate core and UI implementation.
 *
 * Provides safe fallbacks when UI/audio hooks are missing so headless test
 * harnesses can exercise the mandate state machine without DOM dependencies.
 */
function buildUiAdapter(adapter = {}, getLastBindings = () => ({})) {
    const fallback = {
        withImperialAudioGuard: (fn) => (typeof fn === 'function' ? fn() : null),
        sanitizeUIBindings: (uiBindings = {}) => (uiBindings && typeof uiBindings === 'object' ? uiBindings : {}),
        showImperialMessage: () => null,
        renderImperialModal: () => null,
        queueImperialNotification: () => false,
        showMandateBanner: () => false,
        showRebelDecreeCallout: () => false
    };

    return {
        withImperialAudioGuard: adapter.withImperialAudioGuard || fallback.withImperialAudioGuard,
        sanitizeUIBindings: adapter.sanitizeUIBindings || fallback.sanitizeUIBindings,
        renderImperialModal: adapter.renderImperialModal || fallback.renderImperialModal,
        showImperialMessage: adapter.showImperialMessage || fallback.showImperialMessage,
        queueImperialNotification: (lines, uiBindings, options) => {
            if (typeof adapter.queueImperialNotification === 'function') {
                return adapter.queueImperialNotification(lines, uiBindings, options, getLastBindings());
            }
            return fallback.queueImperialNotification();
        },
        showMandateBanner: (lines, uiBindings, title, durationOrOptions) => {
            if (typeof adapter.showMandateBanner === 'function') {
                return adapter.showMandateBanner(lines, uiBindings, title, durationOrOptions, getLastBindings());
            }
            return fallback.showMandateBanner();
        },
        showRebelDecreeCallout: (rebelTile, gameState, uiBindings, options) => {
            if (typeof adapter.showRebelDecreeCallout === 'function') {
                return adapter.showRebelDecreeCallout(rebelTile, gameState, uiBindings, options, getLastBindings());
            }
            return fallback.showRebelDecreeCallout();
        }
    };
}

module.exports = { buildUiAdapter };
