/**
 * Minimal fullscreen intro overlay that blocks interaction until the player
 * acknowledges the start of a session. The overlay sits above all gameplay
 * layers and fades out when dismissed without touching core logic or state.
 */
const IntroOverlay = {
    overlayEl: null,
    beginBtn: null,
    active: true,
    storageKey: 'hexWar_intro_seen',

    /**
     * Wire up the dismiss button and mark the overlay as ready. Accepts an
     * optional document-like object for tests that stub DOM access.
     * @param {Document|Object} doc reference to a DOM-like API with query helpers
     */
    init(doc = typeof document !== 'undefined' ? document : null) {
        if (!doc || this.overlayEl) return false;
        this.overlayEl = doc.getElementById('intro-overlay');
        this.beginBtn = doc.getElementById('btn-intro-begin');
        if (!this.overlayEl || !this.beginBtn) return false;

        this.beginBtn.addEventListener('click', () => this.dismiss());
        this.overlayEl.addEventListener('transitionend', () => {
            if (this.overlayEl.classList.contains('intro-hidden')) {
                this.overlayEl.style.display = 'none';
            }
        });

        // Skip the fade when the intro was already acknowledged, but still
        // broadcast the intro begin event so dependent systems stay in sync.
        if (this.hasSeenIntro()) {
            this.active = false;
            this.overlayEl.classList.add('intro-hidden');
            this.overlayEl.style.display = 'none';
            this.dispatchIntroBegin();
            return true;
        }

        this.active = true;
        this.overlayEl.style.display = 'flex';
        return true;
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
        this.overlayEl.style.display = 'flex';
        this.overlayEl.classList.remove('intro-hidden');
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

    /** Resolve the storage API defensively for browser + test environments. */
    getStorage() {
        if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
        return window.localStorage;
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

if (typeof window !== 'undefined') {
    window.IntroOverlay = IntroOverlay;
    window.addEventListener('DOMContentLoaded', () => IntroOverlay.init());
}

if (typeof module !== 'undefined') {
    module.exports = IntroOverlay;
}
