/**
 * Browser-ready imperial mandate bundle.
 *
 * Wires the core state machine to the UI/audio adapter so DOM-facing helpers are
 * optional in headless tests while remaining available in production builds.
 */
(function (global) {
    const createImperialMandates = (typeof require === 'function')
        ? require('./imperialMandatesCore.js')
        : global.createImperialMandates;

    const adapter = (global.ImperialMandateUIAdapter)
        || ((typeof require === 'function') ? require('./imperialMandatesAdapter.js') : {});

    const api = createImperialMandates(adapter, global);

    global.ImperialMandates = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
