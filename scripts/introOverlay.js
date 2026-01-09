/**
 * Minimal fullscreen intro overlay that blocks interaction until the player
 * acknowledges the start of a session. The overlay sits above all gameplay
 * layers and fades out when dismissed without touching core logic or state.
 */
const IntroOverlay = {
    overlayEl: null,
    beginBtn: null,
    bodyEl: null,
    active: true,
    initialized: false,
    uiReady: false,
    pendingReveal: false,
    storageKey: 'hexWar_intro_seen',

    /**
     * Wire up the dismiss button and mark the overlay as ready. Accepts an
     * optional document-like object for tests that stub DOM access.
     * @param {Document|Object} doc reference to a DOM-like API with query helpers
     */
    init(doc = typeof document !== 'undefined' ? document : null) {
        if (!doc) return false;
        if (this.initialized) return true;
        this.overlayEl = doc.getElementById('intro-overlay');
        this.beginBtn = doc.getElementById('btn-intro-begin');
        this.bodyEl = doc.getElementById('intro-body');
        if (!this.overlayEl || !this.beginBtn) return false;

        this.overlayEl.classList.add('intro-hidden');
        this.overlayEl.style.display = 'none';

        if (this.bodyEl) {
            const introCopy = this.buildIntroCopy();
            if (this.bodyEl.textContent !== introCopy) {
                this.bodyEl.textContent = introCopy;
            }
        }

        this.beginBtn.addEventListener('click', () => this.dismiss());
        this.overlayEl.addEventListener('transitionend', () => {
            if (this.overlayEl.classList.contains('intro-hidden')) {
                this.overlayEl.style.display = 'none';
            }
        });
        this.initialized = true;

        // Skip the fade when the intro was already acknowledged, but still
        // broadcast the intro begin event so dependent systems stay in sync.
        if (this.hasSeenIntro()) {
            this.active = false;
            this.pendingReveal = false;
            this.overlayEl.classList.add('intro-hidden');
            this.overlayEl.style.display = 'none';
            this.dispatchIntroBegin();
            return true;
        }

        this.active = true;
        this.pendingReveal = true;
        if (this.uiReady) {
            this.reveal();
        }
        return true;
    },

    /**
     * Reveal the intro overlay once the UI layer is ready to be masked.
     * Intended to run after Game.init finishes wiring the HUD bindings.
     */
    reveal() {
        if (!this.overlayEl || !this.active) return;
        this.pendingReveal = false;
        this.overlayEl.style.display = 'flex';
        this.overlayEl.classList.remove('intro-hidden');
        this.beginFadeIn();
    },

    /**
     * Apply a brief fade-in handoff so the overlay can crossfade with other
     * boot-time blockers before becoming fully interactive.
     */
    beginFadeIn() {
        if (!this.overlayEl) return;
        this.overlayEl.classList.add('is-fading');
        const clearFade = () => {
            if (this.overlayEl) {
                this.overlayEl.classList.remove('is-fading');
            }
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => requestAnimationFrame(clearFade));
        } else if (typeof setTimeout === 'function') {
            setTimeout(clearFade, 16);
        } else {
            clearFade();
        }
    },

    /**
     * Mark the UI layer as ready so deferred overlays can appear safely.
     */
    notifyUIReady() {
        this.uiReady = true;
        if (this.pendingReveal) {
            this.reveal();
        }
    },

    /**
     * Hide the intro overlay with a fade, allowing the underlying UI to accept
     * input once the transition finishes.
     */
    dismiss() {
        if (!this.overlayEl || !this.active) return;
        this.active = false;
        this.markIntroSeen();
        this.overlayEl.classList.add('intro-hidden');

        // Notify downstream systems that the welcome gate has been cleared so
        // tutorial popups and mandate setup can begin.
        this.dispatchIntroBegin();
    },

    /**
     * Restore the overlay so a fresh campaign can replay the welcome gate.
     * Useful when the user resets progress without reloading the page.
     */
    reset() {
        if (!this.overlayEl) return;
        this.active = true;
        this.pendingReveal = true;
        if (this.uiReady) {
            this.reveal();
        } else {
            this.overlayEl.style.display = 'none';
            this.overlayEl.classList.add('intro-hidden');
        }
        this.dispatchIntroReset();
    },

    /**
     * Check whether the intro has been acknowledged in a previous session.
     * @returns {boolean} true when the overlay should auto-hide.
     */
    hasSeenIntro() {
        const storage = this.getStorage();
        if (!storage) return false;
        return storage.getItem(this.storageKey) === '1';
    },

    /** Persist the dismissal flag so subsequent loads can skip the overlay. */
    markIntroSeen() {
        const storage = this.getStorage();
        if (!storage) return;
        storage.setItem(this.storageKey, '1');
    },

    /** Clear the stored flag so the next session will show the overlay. */
    clearIntroSeenFlag() {
        const storage = this.getStorage();
        if (!storage) return;
        storage.removeItem(this.storageKey);
    },

    /**
     * Build the approved narrative copy for the intro overlay body.
     * @returns {string} approved narrative text for the intro overlay body
     */
    buildIntroCopy() {
        return 'While April’s thaw marks your arrival, the frontier offers only a brief reprieve. The first deployments are still breaking ground, but the sun is already setting sooner. Use this spring to build; in this land, the shadow of winter is never far behind.';
    },

    /** Resolve the storage API defensively for browser + test environments. */
    getStorage() {
        if (typeof window === 'undefined') return null;
        try {
            return typeof window.localStorage !== 'undefined' ? window.localStorage : null;
        } catch (error) {
            return null;
        }
    },

    /** Dispatch the intro begin lifecycle event when the overlay is cleared. */
    dispatchIntroBegin() {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('intro:begin'));
        }
    },

    /** Dispatch the intro reset lifecycle event when the overlay reactivates. */
    dispatchIntroReset() {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('intro:reset'));
        }
    }
};

/**
 * Register the intro overlay helper and optionally schedule DOM wiring.
 * @param {Window|Object} [target] global object to attach IntroOverlay to.
 * @param {Object} [options] optional init overrides for tests.
 * @param {Document|Object|null} [options.document] document-like scope to query.
 * @param {boolean} [options.defer=true] whether to wait for DOMContentLoaded.
 * @returns {{ IntroOverlay: Object, listener: Function|null }}
 */
function initIntroOverlay(target = typeof window !== 'undefined' ? window : undefined, options = {}) {
    const doc = options.document || target?.document || (typeof document !== 'undefined' ? document : null);
    if (target) {
        target.IntroOverlay = IntroOverlay;
    }
    if (IntroOverlay.initialized) {
        return { IntroOverlay, listener: null, initialized: true };
    }

    let listener = null;
    const shouldDefer = options.defer !== false && doc?.addEventListener;
    let initialized = null;
    const runInit = () => {
        initialized = IntroOverlay.init(doc);
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

    return { IntroOverlay, listener, initialized };
}

export { IntroOverlay, initIntroOverlay };

