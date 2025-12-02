/**
 * Manage a dedicated CSS fog overlay that sits between the map canvas and UI.
 * The overlay uses PNG art so the fog can be reskinned without changing tile
 * rendering or game logic.
 */
const FogOverlay = {
    fogEl: null,
    activeVariant: 'dark',
    variants: {
        dark: 'assets/fog/fogdark.png',
        light: 'assets/fog/foglight.png'
    },

    /**
     * Locate the fog overlay container and apply the current variant.
     * @param {Document|Object} doc DOM-like object used for querying elements
     * @returns {boolean} true when the overlay element is ready
     */
    init(doc = typeof document !== 'undefined' ? document : null) {
        if (!doc || this.fogEl) return false;
        this.fogEl = doc.getElementById('fog-overlay');
        if (!this.fogEl) return false;
        this.applyVariant(this.activeVariant);
        return true;
    },

    /**
     * Swap the fog art without disturbing map input or game systems.
     * @param {('dark'|'light')} variant key for the desired PNG variant
     * @returns {string} variant that was ultimately applied
     */
    setVariant(variant = 'dark') {
        const normalized = typeof variant === 'string' ? variant.toLowerCase() : 'dark';
        this.activeVariant = this.variants[normalized] ? normalized : 'dark';
        if (!this.fogEl) return this.activeVariant;
        return this.applyVariant(this.activeVariant);
    },

    /**
     * Internal helper to set the background image and track the active variant.
     * @param {string} variant normalized variant key
     * @returns {string} variant applied to the overlay
     */
    applyVariant(variant) {
        const source = this.variants[variant] || this.variants.dark;
        this.fogEl.style.backgroundImage = `url('${source}')`;
        if (typeof this.fogEl.setAttribute === 'function') {
            this.fogEl.setAttribute('data-fog-variant', variant);
        }
        this.activeVariant = variant;
        return this.activeVariant;
    }
};

/**
 * Convenience wrapper so other systems can request a fog swap without needing
 * to reference the overlay internals.
 * @param {('dark'|'light')} variant requested fog variant
 * @returns {string} variant that is now active
 */
function setFogVariant(variant = 'dark') {
    return FogOverlay.setVariant(variant);
}

if (typeof window !== 'undefined') {
    window.FogOverlay = FogOverlay;
    window.setFogVariant = setFogVariant;
    window.addEventListener('DOMContentLoaded', () => FogOverlay.init());
}

if (typeof module !== 'undefined') {
    module.exports = { FogOverlay, setFogVariant };
}
