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

const RenderConfig = { CAMERA_MOTION_CONFIG, AMBIENCE_CONFIG };

if (typeof window !== 'undefined') {
    window.RenderConfig = RenderConfig;
}

export { CAMERA_MOTION_CONFIG, AMBIENCE_CONFIG };
export default RenderConfig;

if (typeof module !== 'undefined') {
    module.exports = RenderConfig;
}
