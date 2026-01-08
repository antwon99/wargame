/**
 * Bootstrap helpers for resolving runtime dependencies when legacy globals
 * or explicit providers are supplied.
 */

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
        tutorialHandler: resolveValue('tutorialHandler', 'TutorialHandler'),
        imperialMandates: resolveValue('imperialMandates', 'ImperialMandates'),
        imperialMandateManager: resolveValue('imperialMandateManager', 'ImperialMandateManager'),
        platformAdapter: resolveValue('platformAdapter', 'PlatformAdapter'),
        tutorialCallouts: resolveValue('tutorialCallouts', 'TutorialCallouts'),
        introOverlay: resolveValue('introOverlay', 'IntroOverlay'),
        bootOverlay: resolveValue('bootOverlay', 'BootOverlay'),
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

export default { buildBootstrapDependencies, publishBootstrapHandles };
