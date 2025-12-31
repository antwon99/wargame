/**
 * Validate that critical bootstrap helpers exist before launching the game loop.
 * This helper is isolated so Node-based tests can reuse it without requiring the
 * full DOM renderer or ESM entrypoint.
 *
 * @param {object} [options] optional dependency overrides for tests.
 * @param {object|null} [options.researchSystem] injected ResearchSystem API.
 * @param {object|null} [options.persistence] injected Persistence API.
 * @param {object|null} [options.inputHelpers] injected InputHelpers utility bag.
 * @param {HTMLElement|null} [options.debugEl] target element for surfacing errors.
 * @param {HTMLCanvasElement|null} [options.canvas] main render canvas.
 * @param {CanvasRenderingContext2D|null} [options.ctx] context used for drawing.
 * @param {boolean} [options.logToDebug=true] whether to write to the debug log.
 * @returns {{missingHelpers: string[], researchSystemAvailable: boolean, persistenceAvailable: boolean, inputHelpersAvailable: boolean, canvasAvailable: boolean}}
 */
export function validateBootstrapDependencies({
    researchSystem = (typeof window !== 'undefined' ? window.ResearchSystem : null),
    persistence = (typeof window !== 'undefined' ? window.Persistence : null),
    inputHelpers = (typeof window !== 'undefined' ? window.InputHelpers : null),
    debugEl = (typeof document !== 'undefined' ? document.getElementById('debug-log') : null),
    canvas = (typeof document !== 'undefined' ? document.getElementById('canvas') : null),
    ctx = null,
    logToDebug = true
} = {}) {
    const status = {
        researchSystemAvailable: Boolean(researchSystem),
        persistenceAvailable: Boolean(persistence),
        inputHelpersAvailable: Boolean(inputHelpers),
        canvasAvailable: Boolean(canvas && (ctx || canvas.getContext?.('2d')))
    };

    const missingHelpers = [];
    if (!status.researchSystemAvailable) missingHelpers.push('ResearchSystem (tech tree)');
    if (!status.persistenceAvailable) missingHelpers.push('Persistence (save system)');
    if (!status.inputHelpersAvailable) missingHelpers.push('InputHelpers (hex math)');
    if (!status.canvasAvailable) missingHelpers.push('Canvas rendering context');

    if (missingHelpers.length && logToDebug && debugEl) {
        debugEl.classList?.add?.('visible');
        debugEl.textContent = `⚠️ Missing helpers: ${missingHelpers.join('; ')}`;
    }

    return { ...status, missingHelpers };
}

export default validateBootstrapDependencies;
