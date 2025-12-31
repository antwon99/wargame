/**
 * Browser-ready imperial mandate bundle.
 *
 * Wires the core state machine to the UI/audio adapter so DOM-facing helpers are
 * optional in headless tests while remaining available in production builds.
 */
import createImperialMandates from './imperialMandatesCore.js';
import ImperialMandateUIAdapter from './imperialMandatesAdapter.js';

/**
 * Build or retrieve the imperial mandates API using the provided scope.
 * @param {Window|Object} [global] host scope for adapter + global registration.
 * @returns {Object} imperial mandates API instance.
 */
function initImperialMandates(global = typeof window !== 'undefined' ? window : globalThis) {
    const coreFactory = global.createImperialMandates || createImperialMandates;
    const adapter = global.ImperialMandateUIAdapter || ImperialMandateUIAdapter;

    const adapterApi = adapter?.initImperialMandatesAdapter
        ? adapter.initImperialMandatesAdapter(global)
        : adapter;

    const createFn = coreFactory?.initImperialMandatesCore
        ? coreFactory.initImperialMandatesCore(global).createImperialMandates
        : coreFactory;

    const api = createFn(adapterApi, global);

    if (global) {
        global.ImperialMandates = api;
    }

    return api;
}

export { initImperialMandates };

if (typeof module !== 'undefined') {
    module.exports = { initImperialMandates };
}
