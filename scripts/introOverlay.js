/**
 * Minimal fullscreen intro overlay that blocks interaction until the player
 * acknowledges the start of a session. The overlay sits above all gameplay
 * layers and fades out when dismissed without touching core logic or state.
 */
const IntroOverlay = {
    overlayEl: null,
    beginBtn: null,
    active: true,

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
        return true;
    },

    /**
     * Hide the intro overlay with a fade, allowing the underlying UI to accept
     * input once the transition finishes.
     */
    dismiss() {
        if (!this.overlayEl || !this.active) return;
        this.active = false;
        this.overlayEl.classList.add('intro-hidden');

        // Notify downstream systems that the welcome gate has been cleared so
        // tutorial popups and mandate setup can begin.
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('intro:begin'));
        }
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
    }
};

if (typeof window !== 'undefined') {
    window.IntroOverlay = IntroOverlay;
    window.addEventListener('DOMContentLoaded', () => IntroOverlay.init());
}

if (typeof module !== 'undefined') {
    module.exports = IntroOverlay;
}
