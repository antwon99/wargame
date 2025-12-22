/**
 * Guarantee that legacy globals remain available after bundling. The game
 * runtime still references these names to hydrate settings, persistence, and
 * HUD helpers. The shim intentionally no-ops when a value already exists so
 * consumers can override behavior in tests.
 *
 * @param {object} scope window-like object for attaching globals.
 * @param {object} providers fallback implementations to publish when missing.
 * @returns {Array<string>} list of globals that remain missing after shimming.
 */
export function ensureGlobalShims(
    scope = typeof window !== 'undefined' ? window : globalThis,
    providers = {}
) {
    const required = {
        InputHelpers: providers.InputHelpers || scope.InputHelpers,
        ResearchSystem: providers.ResearchSystem || scope.ResearchSystem,
        RebelSystem: providers.RebelSystem || scope.RebelSystem,
        ImperialMandates: providers.ImperialMandates || scope.ImperialMandates,
        ImperialMandateManager: providers.ImperialMandateManager || scope.ImperialMandateManager,
        PlatformAdapter: providers.PlatformAdapter || scope.PlatformAdapter,
        TutorialCallouts: providers.TutorialCallouts || scope.TutorialCallouts,
        IntroOverlay: providers.IntroOverlay || scope.IntroOverlay,
        Persistence: providers.Persistence || scope.Persistence,
        StorageProbe: providers.StorageProbe || scope.StorageProbe
    };

    Object.entries(required).forEach(([key, value]) => {
        if (!scope[key] && value) {
            scope[key] = value;
        }
    });

    const missing = Object.entries(required)
        .filter(([, value]) => !value)
        .map(([key]) => key);

    if (missing.length) {
        throw new Error(`Missing required globals: ${missing.join(', ')}`);
    }

    return [];
}

/**
 * Expose the bootstrap API to the global scope for HTML entry points and
 * legacy consumers that rely on a synchronous script tag ordering.
 *
 * @param {Function} bootstrapGame browser bootstrap function.
 * @param {Function} createGameCore factory that returns the Game core.
 * @param {object} [scope] optional window-like object for publishing globals.
 */
export function publishBootstrapHandles(
    bootstrapGame,
    createGameCore,
    scope = typeof window !== 'undefined' ? window : globalThis
) {
    scope.bootstrapGame = bootstrapGame;
    scope.createGameCore = createGameCore;
}

export default { ensureGlobalShims, publishBootstrapHandles };
