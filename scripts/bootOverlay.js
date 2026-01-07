/**
 * Lightweight fullscreen boot overlay that masks the UI until the game
 * finishes state hydration and wiring UI bindings. The overlay is visible
 * by default from HTML/CSS and only fades once the game signals readiness.
 */
const BootOverlay = {
    overlayEl: null,
    initialized: false,
    hidden: false,

    /**
     * Capture the overlay element and wire the transition cleanup listener.
     * Accepts an optional document-like object for tests or headless use.
     * @param {Document|Object|null} doc DOM-like object with getElementById.
     * @returns {boolean} true when the overlay element is bound.
     */
    init(doc = typeof document !== 'undefined' ? document : null) {
        if (!doc) return false;
        if (this.initialized) return true;
        this.overlayEl = doc.getElementById('boot-overlay');
        if (!this.overlayEl) return false;

        this.overlayEl.classList.remove('boot-hidden');
        this.overlayEl.style.display = 'flex';
        this.overlayEl.addEventListener('transitionend', () => {
            if (this.overlayEl.classList.contains('boot-hidden')) {
                this.overlayEl.style.display = 'none';
            }
        });

        this.initialized = true;
        return true;
    },

    /**
     * Fade the boot overlay away once the UI is safe to reveal.
     */
    hide() {
        if (!this.overlayEl || this.hidden) return;
        this.hidden = true;
        this.overlayEl.classList.add('boot-hidden');
    },

    /**
     * Restore the boot overlay for testing or manual re-entry flows.
     */
    show() {
        if (!this.overlayEl) return;
        this.hidden = false;
        this.overlayEl.classList.remove('boot-hidden');
        this.overlayEl.style.display = 'flex';
    }
};

/**
 * Register the boot overlay helper on the target scope and optionally
 * schedule initialization based on DOM readiness.
 *
 * @param {Window|Object} [target] global object to attach BootOverlay to.
 * @param {Object} [options] optional init overrides for tests.
 * @param {Document|Object|null} [options.document] document-like scope to query.
 * @param {boolean} [options.defer=true] whether to wait for DOMContentLoaded.
 * @returns {{ BootOverlay: Object, listener: Function|null, initialized: boolean|null }}
 */
function initBootOverlay(target = typeof window !== 'undefined' ? window : undefined, options = {}) {
    const doc = options.document || target?.document || (typeof document !== 'undefined' ? document : null);
    if (target) {
        target.BootOverlay = BootOverlay;
    }
    if (BootOverlay.initialized) {
        return { BootOverlay, listener: null, initialized: true };
    }

    let listener = null;
    const shouldDefer = options.defer !== false && doc?.addEventListener;
    let initialized = null;
    const runInit = () => {
        initialized = BootOverlay.init(doc);
        return initialized;
    };

    if (doc && shouldDefer && doc.readyState === 'loading') {
        listener = () => {
            runInit();
            doc.removeEventListener('DOMContentLoaded', listener);
        };
        doc.addEventListener('DOMContentLoaded', listener);
    } else if (doc) {
        runInit();
    }

    return { BootOverlay, listener, initialized };
}

export { BootOverlay, initBootOverlay };

if (typeof module !== 'undefined') {
    BootOverlay.initBootOverlay = initBootOverlay;
    module.exports = BootOverlay;
}
