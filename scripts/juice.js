/**
 * Lightweight helpers for visual feedback utilities.
 * Provides deterministic ranges for burst vectors and shake durations that are
 * shared between the browser game and Node-based tests.
 */
const Juice = {
    /** Generate particle burst offsets with bounded magnitude. */
    createBurstVectors(count = 6, min = 20, max = 60) {
        const safeCount = Math.max(1, Math.min(count, 24));
        const safeMin = Math.max(1, min);
        const safeMax = Math.max(safeMin, max);
        const vectors = [];
        for (let i = 0; i < safeCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = safeMin + Math.random() * (safeMax - safeMin);
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist;
            vectors.push({ dx, dy, duration: 700 });
        }
        return vectors;
    },

    /** Clamp a shake effect duration to reasonable UI-friendly bounds. */
    clampShakeDuration(ms = 300) {
        return Math.min(Math.max(ms, 100), 600);
    }
};

/**
 * Attach the juice helpers to the provided global scope.
 * @param {Window|Object} [target] global object to attach Juice to.
 * @returns {Object} Juice helper API.
 */
function initJuice(target = typeof window !== 'undefined' ? window : undefined) {
    if (target) {
        target.Juice = Juice;
    }
    return Juice;
}

if (typeof module !== 'undefined') {
    Juice.initJuice = initJuice;
    module.exports = Juice;
}
