/**
 * Guarantee that legacy globals remain available after bundling. The game
 * runtime still references these names to hydrate settings, persistence, and
 * HUD helpers. The shim intentionally no-ops when a value already exists so
 * consumers can override behavior in tests.
 *
 * @deprecated Prefer buildBootstrapDependencies and explicit dependency injection.
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
 * Build the dependency object required by the bootstrap entry points without
 * mutating global scope. This centralizes how runtime helpers are resolved so
 * tests and bundles can supply explicit implementations.
 *
 * @param {object} scope window-like object to read legacy globals from.
 * @param {object} [providers] explicit overrides for dependency values.
 * @returns {object} dependency map for createGameCore/bootstrapGame.
 */
export function buildBootstrapDependencies(
    scope = typeof window !== 'undefined' ? window : globalThis,
    providers = {}
) {
    const source = scope || {};
    const resolveValue = (camelKey, legacyKey) => {
        if (Object.prototype.hasOwnProperty.call(providers, camelKey)) return providers[camelKey];
        if (Object.prototype.hasOwnProperty.call(providers, legacyKey)) return providers[legacyKey];
        return source[legacyKey];
    };

    return {
        inputHelpers: resolveValue('inputHelpers', 'InputHelpers'),
        researchSystem: resolveValue('researchSystem', 'ResearchSystem'),
        rebelSystem: resolveValue('rebelSystem', 'RebelSystem'),
        imperialMandates: resolveValue('imperialMandates', 'ImperialMandates'),
        imperialMandateManager: resolveValue('imperialMandateManager', 'ImperialMandateManager'),
        platformAdapter: resolveValue('platformAdapter', 'PlatformAdapter'),
        tutorialCallouts: resolveValue('tutorialCallouts', 'TutorialCallouts'),
        introOverlay: resolveValue('introOverlay', 'IntroOverlay'),
        persistence: resolveValue('persistence', 'Persistence'),
        storageProbe: resolveValue('storageProbe', 'StorageProbe'),
        gameAudio: resolveValue('gameAudio', 'GameAudio'),
        debugToggles: resolveValue('debugToggles', 'DebugToggles'),
        windowScope: source
    };
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

export default { ensureGlobalShims, buildBootstrapDependencies, publishBootstrapHandles };
