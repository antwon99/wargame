/**
 * Browser-ready imperial mandate bundle.
 *
 * Wires the core state machine to the UI/audio adapter so DOM-facing helpers are
 * optional in headless tests while remaining available in production builds.
 */
/**
 * Build or retrieve the imperial mandates API using the provided scope.
 * @param {Window|Object} [global] host scope for adapter + global registration.
 * @returns {Object} imperial mandates API instance.
 */
function initImperialMandates(global = typeof window !== 'undefined' ? window : globalThis) {
    const createImperialMandates = (typeof require === 'function')
        ? require('./imperialMandatesCore.js')
        : global.createImperialMandates;

    const adapter = (global.ImperialMandateUIAdapter)
        || ((typeof require === 'function') ? require('./imperialMandatesAdapter.js') : {});

    const adapterApi = adapter?.initImperialMandatesAdapter
        ? adapter.initImperialMandatesAdapter(global)
        : adapter;

    const createFn = createImperialMandates?.initImperialMandatesCore
        ? createImperialMandates.initImperialMandatesCore(global).createImperialMandates
        : createImperialMandates;

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
