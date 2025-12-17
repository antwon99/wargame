(function (global) {
    const Persistence = (typeof window !== 'undefined' && window.Persistence)
        ? window.Persistence
        : (typeof require === 'function' ? require('./persistence.js') : null);

    /**
     * Build a campaign store facade that wraps the Persistence helpers.
     * This layer keeps leaderboard stats hydrated for UI consumers while
     * delegating actual storage to the configured persistence service.
     *
     * @param {object} [options]
     * @param {object} [options.persistence] optional persistence dependency injection for tests.
     * @returns {{load: function, save: function, clear: function, hasSnapshot: function, getSlotMetadata: function}}
     * facade exposing normalized load + passthrough mutations.
     */
    function createCampaignStore({ persistence = Persistence } = {}) {
        const statHelpers = persistence?.StatHelpers;

        /**
         * Load a campaign payload from persistence and normalize leaderboard stats.
         * Normalization keeps legacy fields (bestDifficulty, warsPlayed) mapped to
         * the UI schema (bestLevel, warsFought) so downstream consumers always
         * receive hydrated data regardless of storage format.
         *
         * @param {string|number|object} [slotOrOptions] slot or loader options forwarded to persistence.
         * @param {object} [options] optional loader options when slot is provided first.
         * @returns {{state: object|null, stats: object, slot: string}}
         */
        function load(slotOrOptions = {}, options = {}) {
            if (!persistence?.loadSnapshot) {
                const normalizedFallback = statHelpers?.normalizeStats ? statHelpers.normalizeStats() : {};
                return { state: null, stats: normalizedFallback, slot: '1' };
            }
            const loaderOptions = (slotOrOptions && typeof slotOrOptions === 'object'
                && typeof slotOrOptions !== 'string'
                && typeof slotOrOptions !== 'number')
                ? slotOrOptions
                : options;
            const payload = persistence.loadSnapshot(slotOrOptions, options);
            const deserializer = persistence.deserializeGameState
                || persistence.SnapshotSerializer?.deserialize
                || Persistence?.deserializeGameState;
            const isHydrated = payload?.state?.overworld?.hexes instanceof Map;
            const normalizedState = (!payload?.state || isHydrated || typeof deserializer !== 'function')
                ? payload?.state
                : deserializer(payload.state, loaderOptions);
            const normalizedStats = statHelpers?.normalizeStats
                ? statHelpers.normalizeStats(payload?.stats || normalizedState?.stats)
                : payload?.stats;
            return { ...payload, state: normalizedState, stats: normalizedStats };
        }

        return {
            load,
            save: (...args) => (persistence?.saveSnapshot ? persistence.saveSnapshot(...args) : null),
            clear: (...args) => (persistence?.clearSnapshot ? persistence.clearSnapshot(...args) : null),
            hasSnapshot: (...args) => (persistence?.hasSnapshot ? persistence.hasSnapshot(...args) : false),
            getSlotMetadata: (...args) => (persistence?.getSlotMetadata ? persistence.getSlotMetadata(...args) : null)
        };
    }

    global.CampaignStore = {
        createCampaignStore
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.CampaignStore;
    }
})(typeof window !== 'undefined' ? window : globalThis);
