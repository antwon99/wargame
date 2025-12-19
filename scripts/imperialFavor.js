const DEFAULT_IMPERIAL_FAVOR = 5;

/**
 * Normalize imperial favor values to the HUD's 1–10 range for both saves and UI.
 * @param {number} value raw favor value from gameplay systems or persistence.
 * @returns {number} clamped favor within the 1–10 range (defaults to midpoint on invalid input).
 */
function clampImperialFavor(value) {
    const numeric = Number.isFinite(value) ? Math.round(value) : DEFAULT_IMPERIAL_FAVOR;
    return Math.min(10, Math.max(1, numeric));
}

export { DEFAULT_IMPERIAL_FAVOR, clampImperialFavor };

const ImperialFavor = { DEFAULT_IMPERIAL_FAVOR, clampImperialFavor };
if (typeof globalThis !== 'undefined') {
    globalThis.ImperialFavor = ImperialFavor;
}
if (typeof module !== 'undefined') {
    module.exports = ImperialFavor;
}
