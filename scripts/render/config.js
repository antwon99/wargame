/**
 * Shared rendering configuration for camera drift and ambient flourishes.
 * Kept separate from gameplay bootstrap so visual tuning stays centralized.
 */
const CAMERA_MOTION_CONFIG = {
    enabled: true,
    amplitude: 9,
    parallax: 0.65,
    speed: 0.18
};

const AMBIENCE_CONFIG = {
    enabled: false,
    fadeRadiusFactor: 0.55,
    fadeFeather: 0.35,
    layers: [
        { opacity: 0.05, drift: { x: 8, y: -3 }, scale: 520, density: 0.18 },
        { opacity: 0.035, drift: { x: -5, y: 6 }, scale: 640, density: 0.22 },
        { opacity: 0.028, drift: { x: 14, y: 9 }, scale: 780, density: 0.14 }
    ]
};

/**
 * Resolve runtime render configuration while tolerating missing globals during
 * tests. Falls back to the bundled config constants when the provided sources
 * are unavailable.
 *
 * @param {Object} [options]
 * @param {Object} [options.renderConfigModule] optional module containing the
 * configuration exports.
 * @param {Object} [options.windowObj] optional window-like object that may
 * expose `RenderConfig`.
 * @returns {{CAMERA_MOTION_CONFIG: typeof CAMERA_MOTION_CONFIG, AMBIENCE_CONFIG: typeof AMBIENCE_CONFIG}}
 */
function resolveRenderConfig({ renderConfigModule, windowObj } = {}) {
    const source = renderConfigModule || windowObj?.RenderConfig || {};
    return {
        CAMERA_MOTION_CONFIG: source.CAMERA_MOTION_CONFIG || CAMERA_MOTION_CONFIG,
        AMBIENCE_CONFIG: source.AMBIENCE_CONFIG || AMBIENCE_CONFIG
    };
}

const RenderConfig = { CAMERA_MOTION_CONFIG, AMBIENCE_CONFIG, resolveRenderConfig };

if (typeof window !== 'undefined') {
    window.RenderConfig = RenderConfig;
}

export { CAMERA_MOTION_CONFIG, AMBIENCE_CONFIG, resolveRenderConfig };
export default RenderConfig;

if (typeof module !== 'undefined') {
    module.exports = RenderConfig;
}
