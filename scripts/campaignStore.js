import Persistence from './persistence.js';

const defaultGlobal = typeof window !== 'undefined' ? window : globalThis;

function resolvePersistence(globalScope = defaultGlobal) {
    return globalScope?.Persistence || Persistence;
}

/**
 * Build a campaign store facade that wraps the Persistence helpers.
 * This layer keeps leaderboard stats hydrated for UI consumers while
 * delegating actual storage to the configured persistence service.
 *
 * @param {object} [options]
 * @param {object} [options.persistence] optional persistence dependency injection for tests.
 * @returns {{load: function, loadCampaign: function, save: function, clear: function, hasSnapshot: function, getSlotMetadata: function}}
 * facade exposing normalized load + passthrough mutations.
 */
function createCampaignStore({ persistence = resolvePersistence() } = {}) {
    const statHelpers = persistence?.StatHelpers;
    const reconcileDifficultyAndWarsWon = statHelpers?.reconcileDifficultyAndWarsWon;

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
        const reconciled = reconcileDifficultyAndWarsWon
            ? reconcileDifficultyAndWarsWon(normalizedState, normalizedStats)
            : { state: normalizedState, stats: normalizedStats };
        return {
            ...payload,
            pendingNotifications: payload?.pendingNotifications,
            state: reconciled.state,
            stats: reconciled.stats
        };
    }

    /**
     * Thin synchronous delegate to persistence snapshot loading.
     * Game.init requires a synchronous payload to hydrate before UI binding
     * and render loop startup, so this avoids async adapters or hydration.
     *
     * @param {string|number|object} [slotOrOptions] slot identifier or loader options.
     * @param {object} [options] passthrough loader options when slot is provided first.
     * @returns {{state: object|null, stats: object, slot: string}} raw snapshot payload.
     */
    function loadCampaign(slotOrOptions = {}, options = {}) {
        if (!persistence?.loadSnapshot) {
            const fallbackStats = statHelpers?.normalizeStats ? statHelpers.normalizeStats() : {};
            return { state: null, stats: fallbackStats, slot: '1' };
        }
        const payload = persistence.loadSnapshot(slotOrOptions, options);
        if (!reconcileDifficultyAndWarsWon) {
            return payload;
        }
        const reconciled = reconcileDifficultyAndWarsWon(payload?.state, payload?.stats);
        return {
            ...payload,
            state: reconciled.state,
            stats: reconciled.stats
        };
    }

    return {
        load,
        loadCampaign,
        save: (...args) => (persistence?.saveSnapshot ? persistence.saveSnapshot(...args) : null),
        clear: (...args) => (persistence?.clearSnapshot ? persistence.clearSnapshot(...args) : null),
        hasSnapshot: (...args) => (persistence?.hasSnapshot ? persistence.hasSnapshot(...args) : false),
        getSlotMetadata: (...args) => (persistence?.getSlotMetadata ? persistence.getSlotMetadata(...args) : null)
    };
}

const CampaignStore = { createCampaignStore };
defaultGlobal.CampaignStore = CampaignStore;

export { createCampaignStore };
export default CampaignStore;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CampaignStore;
}
