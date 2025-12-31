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
        this.bodyEl = doc.getElementById('intro-body');
        if (!this.overlayEl || !this.beginBtn) return false;

        if (this.bodyEl) {
            this.bodyEl.textContent = this.buildIntroCopy();
        }

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

    /**
     * Build a short, season-aware intro line that references the spring start
     * in April and the first deployments toward the frontier.
     * @param {Date} [currentDate] optional date for deterministic tests
     * @returns {string} intro copy tuned for the provided month
     */
    buildIntroCopy(currentDate = new Date()) {
        const monthIndex = currentDate.getMonth();
        const monthName = this.getMonthName(monthIndex);
        const season = this.getSeason(monthIndex);

        if (season === 'Spring') {
            const springLead = monthName === 'April'
                ? 'this April'
                : `${monthName} after the April muster`;
            return `Spring opens in April, and ${springLead} the first deployments are already rolling toward the frontier.`;
        }

        return `${season} follows the April spring start, and the first frontier deployments are still settling in as ${monthName} unfolds.`;
    },

    /**
     * Resolve the season name based on the zero-indexed month.
     * @param {number} monthIndex zero-indexed month from Date#getMonth()
     * @returns {string} season label
     */
    getSeason(monthIndex) {
        if (monthIndex >= 2 && monthIndex <= 4) return 'Spring';
        if (monthIndex >= 5 && monthIndex <= 7) return 'Summer';
        if (monthIndex >= 8 && monthIndex <= 10) return 'Autumn';
        return 'Winter';
    },

    /**
     * Resolve a friendly month name from a zero-indexed month.
     * @param {number} monthIndex zero-indexed month from Date#getMonth()
     * @returns {string} display month name
     */
    getMonthName(monthIndex) {
        const months = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December'
        ];
        return months[monthIndex] || 'Unknown';
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

if (typeof module !== 'undefined') {
    IntroOverlay.initIntroOverlay = initIntroOverlay;
    module.exports = IntroOverlay;
}
