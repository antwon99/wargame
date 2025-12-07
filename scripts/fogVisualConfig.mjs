/**
 * Default fog visual parameters that drive the overworld/combat backdrops.
 * The defaults intentionally bias toward a dark void fill, leaving gradients
 * and overlays opt-in for debug experimentation without impacting saves.
 *
 * Visual modes:
 * - `void` (default): pure dark canvas clear with no ambience or gradients.
 * - `seasonalSnow`: opt-in, non-default hook for future seasonal/snow tests.
 */
const BASE_CLUSTER_INTENSITY = 0.42;
const DEFAULT_CORE_INNER_OPACITY = 0.86 - Math.min(0.28, BASE_CLUSTER_INTENSITY * 0.18);

const MIN_CORE_INNER_OPACITY = 0.05;

const FOG_VISUAL_MODES = {
    VOID: 'void',
    SEASONAL_SNOW: 'seasonalSnow'
};

const FOG_VISUAL_CONFIG = {
    // Seasonal/month-based experiments remain opt-in; the default never auto-flips.
    visualMode: FOG_VISUAL_MODES.VOID,
    enabled: true,
    /** Toggle tile-level fog-of-war overlays without touching backdrop visuals. */
    tileFogEnabled: false,
    /** Toggle the drifting ambience cloud renderer independent of the backdrop. */
    ambienceLayersEnabled: false,
    /** Toggle the classic gradient/ripple/spotlight stack without impacting tile fog. */
    legacyBackdropEnabled: false,
    /** Toggle ambient-driven fog flourishes (gradients, ripples, spotlights). */
    ambienceEnabled: false,
    /** Enable or disable the radial gradient fill that anchors the backdrop. */
    gradientEnabled: false,
    /** Fall back to a simple void fill when ambience is disabled. */
    baseFillOnlyWhenAmbienceDisabled: true,
    clusterGlowEnabled: false,
    clusterIntensity: BASE_CLUSTER_INTENSITY,
    clusterRadiusMultiplier: 4.9,
    clusterCoreBoost: 0.18,
    coreInnerOpacity: DEFAULT_CORE_INNER_OPACITY,
    parallaxAmplitude: 28,
    parallaxSpeed: 0.35,
    rippleEnabled: false,
    rippleOpacity: 0.5,
    voidFill: '#0b0b11',
    fogGradientStops: {
        innerBase: '56, 62, 76',
        mid: 'rgba(32, 36, 46, 0.76)',
        outer: 'rgba(6, 6, 10, 0.96)'
    },
    rippleGradientStops: {
        inner: 'rgba(255,255,255,0.03)',
        mid: 'rgba(120,120,140,0.02)',
        outer: 'rgba(0,0,0,0)'
    },
    spotlightColors: {
        innerBase: '205, 225, 255',
        mid: 'rgba(120, 150, 200, 0.22)',
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
    const opacity = Number.isFinite(fogConfig.coreInnerOpacity)
        ? fogConfig.coreInnerOpacity
        : FOG_VISUAL_CONFIG.coreInnerOpacity;
    return Math.max(MIN_CORE_INNER_OPACITY, Math.min(1, opacity));
}

/**
 * Combine caller overrides with the defaults while clamping user-facing opacities
 * to reasonable values. Nested gradient stop collections are returned intact or
 * fall back to defaults so downstream rendering never dereferences undefined.
 * @param {Object} [fogConfig] optional overrides from feature toggles or saves
 * @returns {Object} sanitized config that mirrors `FOG_VISUAL_CONFIG` shape
 */
function resolveFogVisualConfig(fogConfig = {}) {
    const normalized = { ...FOG_VISUAL_CONFIG, ...(fogConfig || {}) };
    const allowedModes = new Set(Object.values(FOG_VISUAL_MODES));
    normalized.visualMode = allowedModes.has(normalized.visualMode)
        ? normalized.visualMode
        : FOG_VISUAL_CONFIG.visualMode;
    normalized.coreInnerOpacity = resolveFogInnerOpacity(normalized);
    const rippleOpacity = Number.isFinite(normalized.rippleOpacity)
        ? normalized.rippleOpacity
        : FOG_VISUAL_CONFIG.rippleOpacity;
    normalized.rippleOpacity = Math.max(0, Math.min(1, rippleOpacity));

    normalized.fogGradientStops = fogConfig?.fogGradientStops || FOG_VISUAL_CONFIG.fogGradientStops;
    normalized.rippleGradientStops = fogConfig?.rippleGradientStops || FOG_VISUAL_CONFIG.rippleGradientStops;
    normalized.spotlightColors = fogConfig?.spotlightColors || FOG_VISUAL_CONFIG.spotlightColors;

    return normalized;
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

export {
    FOG_VISUAL_MODES,
    FOG_VISUAL_CONFIG,
    resolveFogInnerOpacity,
    resolveFogParallax,
    resolveFogVisualConfig
};
