/**
 * Registry helpers for mandate blueprint discovery.
 *
 * Decouples blueprint lookup from runtime state to keep the state machine test
 * friendly while still leveraging the shared declarative registry.
 */
function loadMandateRegistry(runtimeGlobal = (typeof window !== 'undefined' ? window : globalThis)) {
    const global = runtimeGlobal;
    const registry = (global.ImperialMandateRegistry)
        || (typeof require === 'function' ? require('../imperialMandateRegistry.js') : null);
    return Array.isArray(registry) ? registry : [];
}

function createRegistryHelpers(registry = []) {
    const collection = Array.isArray(registry) ? registry : [];
    return {
        /**
         * Locate a declarative mandate blueprint without coupling to runtime logic.
         * @param {string} id mandate identifier.
         * @returns {object|null} registry entry when found.
         */
        getMandateBlueprint: (id) => collection.find((entry) => entry.id === id) || null
    };
}

module.exports = { loadMandateRegistry, createRegistryHelpers };
