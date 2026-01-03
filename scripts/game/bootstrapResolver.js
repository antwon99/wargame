const fallbackValidateBootstrapDependencies = ({
    researchSystem = null,
    persistence = null,
    inputHelpers = null,
    debugEl = (typeof document !== 'undefined' ? document.getElementById('debug-log') : null),
    canvas = (typeof document !== 'undefined' ? document.getElementById('canvas') : null),
    ctx = null,
    logToDebug = true
} = {}) => {
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
};
let cachedBootstrapValidator = fallbackValidateBootstrapDependencies;
let bootstrapValidatorPromise = null;

/**
 * Resolve the bootstrap validator without forcing the ES module load.
 * @returns {Function} bootstrap dependency validation helper.
 */
const getBootstrapValidator = () => {
    if (!bootstrapValidatorPromise) {
        bootstrapValidatorPromise = import('../bootstrapValidator.js')
            .then((module) => {
                cachedBootstrapValidator = module.validateBootstrapDependencies || fallbackValidateBootstrapDependencies;
            })
            .catch(() => {
                cachedBootstrapValidator = cachedBootstrapValidator || fallbackValidateBootstrapDependencies;
            });
    }

    return cachedBootstrapValidator;
};

export { getBootstrapValidator };
