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

export { FOG_VISUAL_CONFIG, resolveFogInnerOpacity };
