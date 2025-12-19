const { createImperialMandateState } = require('./imperialMandates/state.js');
const { loadMandateRegistry } = require('./imperialMandates/registry.js');

/**
 * Imperial mandate entry point.
 *
 * Resolves runtime dependencies (calendar helpers, favor utilities, registry
 * data, and UI adapters) before delegating lifecycle management to the shared
 * state machine housed in `scripts/imperialMandates/state.js`.
 */
function createImperialMandates(adapter = {}, runtimeGlobal = (typeof window !== 'undefined' ? window : globalThis)) {
    const global = runtimeGlobal;
    const RebelSystem = (global.RebelSystem)
        || (typeof require === 'function' ? require('./rebelSystem.js') : {});
    const TutorialCallouts = (global.TutorialCallouts)
        || (typeof require === 'function' ? require('./tutorialCallouts.js') : null);
    const MandateCalendar = (global.ImperialMandateCalendar)
        || (typeof require === 'function' ? require('./imperialMandateCalendar.js') : null);
    const imperialFavorHelpers = (typeof require === 'function')
        ? require('./imperialFavor.js')
        : global.ImperialFavor;
    const registry = loadMandateRegistry(global);

    return createImperialMandateState({
        adapter,
        registry,
        calendar: MandateCalendar,
        favorHelpers: imperialFavorHelpers,
        rebelSystem: RebelSystem,
        tutorialCallouts: TutorialCallouts,
        runtimeGlobal: global
    });
}

module.exports = createImperialMandates;
