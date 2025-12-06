/**
 * Default fog visual parameters that drive the overworld/combat backdrops.
 * The defaults preserve the current presentation while allowing callers to
 * override specific values when experimenting with atmosphere.
 */
const BASE_CLUSTER_INTENSITY = 0.32;
const DEFAULT_CORE_INNER_OPACITY = 0.75 - Math.min(0.25, BASE_CLUSTER_INTENSITY * 0.25);

const FOG_VISUAL_CONFIG = {
    enabled: true,
    clusterGlowEnabled: true,
    clusterIntensity: BASE_CLUSTER_INTENSITY,
    clusterRadiusMultiplier: 5.4,
    coreInnerOpacity: DEFAULT_CORE_INNER_OPACITY,
    parallaxAmplitude: 28,
    parallaxSpeed: 0.35,
    rippleEnabled: true,
    rippleOpacity: 0.5,
    voidFill: '#0b0b11',
    fogGradientStops: {
        innerBase: '38, 40, 50',
        mid: 'rgba(18, 20, 28, 0.82)',
        outer: 'rgba(4, 4, 8, 0.98)'
    },
    rippleGradientStops: {
        inner: 'rgba(255,255,255,0.03)',
        mid: 'rgba(120,120,140,0.02)',
        outer: 'rgba(0,0,0,0)'
    },
    spotlightColors: {
        innerBase: '180, 200, 230',
        mid: 'rgba(80, 90, 120, 0.18)',
        outer: 'rgba(0, 0, 0, 0)'
    }
};

/**
 * Resolve the opacity for the fog's inner gradient ring without coupling it to
 * spotlight intensity. The value is clamped to the valid range so callers can
 * safely supply custom overrides from user settings.
 * @param {Object} [fogConfig] custom fog visual overrides
 * @param {number} [fogConfig.coreInnerOpacity] opacity used at the gradient's center
 * @returns {number} normalized opacity between 0 and 1
 */
function resolveFogInnerOpacity(fogConfig = {}) {
    const opacity = fogConfig.coreInnerOpacity ?? FOG_VISUAL_CONFIG.coreInnerOpacity;
    return Math.max(0, Math.min(1, opacity));
}

/**
 * Retrieve the fog drift parallax parameters in a single place so both runtime
 * experiments and rendering can trust the same defaults. Callers may supply a
 * partial config (e.g., from feature toggles) to override one or both values.
 * @param {Object} [fogConfig] fog visual overrides or user preferences
 * @param {number} [fogConfig.parallaxSpeed] speed multiplier for the drift
 * @param {number} [fogConfig.parallaxAmplitude] amplitude multiplier for drift
 * @returns {{parallaxSpeed: number, parallaxAmplitude: number}} effective values
 */
function resolveFogParallax(fogConfig = {}) {
    const effective = { ...FOG_VISUAL_CONFIG, ...fogConfig };
    return {
        parallaxSpeed: effective.parallaxSpeed,
        parallaxAmplitude: effective.parallaxAmplitude
    };
}

/**
 * Expose runtime hooks for tuning fog parallax without changing render logic.
 * The returned API can be wired to debug sliders or invoked directly from the
 * console (e.g., `FogParallaxTuning.setSpeed(0.5)`). Values persist in
 * `FOG_VISUAL_CONFIG`, keeping a single source of truth for drift behavior.
 * @param {Object} [globalTarget] object to attach the tuning API to
 * @returns {Object|undefined} the attached API for chaining or undefined when skipped
 */
function attachFogParallaxDebugControls(globalTarget = typeof window !== 'undefined' ? window : undefined) {
    if (!globalTarget) return undefined;

    const api = {
        /**
         * Adjust the fog parallax speed multiplier at runtime. Invalid inputs
         * are ignored to avoid corrupting the shared config.
         * @param {number} speed new speed value
         * @returns {number} resulting stored speed
         */
        setSpeed(speed) {
            if (Number.isFinite(speed)) {
                FOG_VISUAL_CONFIG.parallaxSpeed = speed;
            }
            return FOG_VISUAL_CONFIG.parallaxSpeed;
        },

        /**
         * Adjust the fog parallax amplitude multiplier at runtime. Invalid
         * inputs are ignored to keep the backing config stable.
         * @param {number} amplitude new amplitude value
         * @returns {number} resulting stored amplitude
         */
        setAmplitude(amplitude) {
            if (Number.isFinite(amplitude)) {
                FOG_VISUAL_CONFIG.parallaxAmplitude = amplitude;
            }
            return FOG_VISUAL_CONFIG.parallaxAmplitude;
        },

        /**
         * Snapshot the current parallax tuning to wire into UI sliders without
         * worrying about mutating the object reference.
         * @returns {{parallaxSpeed: number, parallaxAmplitude: number}} copy of values
         */
        getValues() {
            return resolveFogParallax();
        }
    };

    globalTarget.FogParallaxTuning = api;
    return api;
}

export { FOG_VISUAL_CONFIG, resolveFogInnerOpacity, resolveFogParallax, attachFogParallaxDebugControls };
