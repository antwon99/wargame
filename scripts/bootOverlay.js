/**
 * Lightweight fullscreen boot overlay that masks the UI until the game
 * finishes state hydration and wiring UI bindings. The overlay is visible
 * by default from HTML/CSS and only fades once the game signals readiness.
 */
const BootOverlay = {
    overlayEl: null,
    errorEl: null,
    statusEl: null,
    readyTextEl: null,
    readyButtonEl: null,
    initialized: false,
    hidden: false,
    requiresAcknowledgement: false,
    readyAcknowledged: false,
    onAcknowledged: null,

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
        this.errorEl = doc.getElementById('boot-overlay-error');
        this.statusEl = doc.getElementById('boot-overlay-status');
        this.readyTextEl = doc.getElementById('boot-overlay-ready-text');
        this.readyButtonEl = doc.getElementById('boot-overlay-ready');
        if (!this.overlayEl) return false;

        this.overlayEl.classList.remove('boot-hidden', 'is-fading');
        this.overlayEl.style.display = 'flex';
        this.requiresAcknowledgement = Boolean(this.readyButtonEl);
        this.readyAcknowledged = false;
        if (this.readyButtonEl) {
            this.readyButtonEl.disabled = true;
            this.readyButtonEl.classList.remove('is-visible');
            this.readyButtonEl.addEventListener('click', () => {
                this.readyAcknowledged = true;
                this.hide();
                if (typeof this.onAcknowledged === 'function') {
                    this.onAcknowledged();
                }
            });
        }
        if (this.readyTextEl) {
            this.readyTextEl.classList.remove('is-visible');
        }
        if (this.statusEl) {
            this.statusEl.classList.remove('is-hidden');
        }
        this.overlayEl.addEventListener('transitionend', () => {
            if (!this.overlayEl) return;
            if (this.overlayEl.classList.contains('is-fading')) {
                this.overlayEl.classList.remove('is-fading');
                this.overlayEl.classList.add('boot-hidden');
            }
            if (this.overlayEl.classList.contains('boot-hidden')) {
                this.overlayEl.style.display = 'none';
            }
        });

        this.initialized = true;
        return true;
    },

    /**
     * Fade the boot overlay away once the UI is safe to reveal and the player
     * acknowledges readiness when required.
     */
    hide() {
        if (!this.overlayEl || this.hidden) return;
        if (this.requiresAcknowledgement && !this.readyAcknowledged) return;
        this.hidden = true;
        this.overlayEl.classList.add('is-fading');
    },

    /**
     * Restore the boot overlay for testing or manual re-entry flows.
     */
    show() {
        if (!this.overlayEl) return;
        this.hidden = false;
        this.readyAcknowledged = false;
        this.overlayEl.classList.remove('boot-hidden', 'is-fading');
        this.overlayEl.style.display = 'flex';
        if (this.statusEl) {
            this.statusEl.classList.remove('is-hidden');
        }
        if (this.readyTextEl) {
            this.readyTextEl.classList.remove('is-visible');
        }
        if (this.readyButtonEl) {
            this.readyButtonEl.disabled = true;
            this.readyButtonEl.classList.remove('is-visible');
        }
    },

    /**
     * Reveal and enable the ready button once the game finishes bootstrapping.
     */
    markReady() {
        if (this.statusEl) {
            this.statusEl.classList.add('is-hidden');
        }
        if (this.readyTextEl) {
            this.readyTextEl.classList.add('is-visible');
        }
        if (!this.readyButtonEl) return;
        this.readyButtonEl.disabled = false;
        this.readyButtonEl.classList.add('is-visible');
    },

    /**
     * Register a callback to run once the player acknowledges readiness.
     * @param {Function|null} handler callback invoked after the ready click.
     */
    setOnAcknowledged(handler) {
        this.onAcknowledged = typeof handler === 'function' ? handler : null;
    },

    /**
     * Surface a loading failure message inside the boot overlay so players see
     * why the game cannot proceed without exposing the debug log.
     * @param {string} message human-readable error message to display.
     */
    setError(message) {
        if (!this.errorEl) return;
        const hasMessage = Boolean(message);
        this.errorEl.textContent = hasMessage ? message : '';
        this.errorEl.classList.toggle('is-visible', hasMessage);
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

