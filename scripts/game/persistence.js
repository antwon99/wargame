import { DEFAULT_IMPERIAL_FAVOR } from '../imperialFavor.js';

/**
 * Build a persistence service boundary so the Game core never interacts with
 * raw storage or browser APIs directly. The service normalizes stats defaults,
 * routes snapshot save/load/reset operations, and replays notification queues
 * after UI bindings are available.
 *
 * @param {object} [options]
 * @param {object|null} [options.persistence] backing persistence adapter with save/load helpers.
 * @param {object} [options.fallbackStats] stats template used when persistence is unavailable.
 * @param {function} [options.hexFactory] factory for creating Hex instances during hydration.
 * @returns {object} persistence service surface consumed by the Game core.
 */
export function createPersistenceService({
    persistence = (typeof window !== 'undefined' ? window.Persistence : null),
    fallbackStats = {
        bestLevel: 0,
        bestKills: 0,
        totalKills: 0,
        warsFought: 0,
        lastOutcome: 'N/A',
        lastSaveISO: null,
        imperialFavor: DEFAULT_IMPERIAL_FAVOR
    },
    hexFactory = null
} = {}) {
    const hasPersistence = Boolean(persistence);
    const defaultStats = hasPersistence && persistence?.DEFAULT_STATS
        ? { ...persistence.DEFAULT_STATS }
        : { ...fallbackStats };

    const safeHexFactory = typeof hexFactory === 'function'
        ? hexFactory
        : ((q, r, s) => {
            if (typeof window !== 'undefined' && window.Hex) {
                return new window.Hex(q, r, s);
            }
            return { q, r, s, toString() { return `${this.q},${this.r}`; } };
        });

    /** Normalize potentially sparse or legacy stats payloads against defaults. */
    function normalizeStats(stats = {}) {
        if (persistence?.StatHelpers?.normalizeStats) {
            return persistence.StatHelpers.normalizeStats(stats);
        }
        return { ...defaultStats, ...(stats || {}) };
    }

    /** Replay serialized notifications once enqueue helpers are bound. */
    function replayNotifications(game) {
        if (!Array.isArray(game?.pendingNotifications) || !game.pendingNotifications.length) return;
        if (typeof game.enqueueNotification !== 'function') return;
        game.pendingNotifications.forEach(note => game.enqueueNotification(note));
        game.pendingNotifications = [];
    }

    return {
        /** Report whether an underlying persistence adapter is available. */
        isAvailable() {
            return hasPersistence;
        },

        /** Provide a defensive copy of default stats for UI hydration. */
        getDefaultStats() {
            return { ...defaultStats };
        },

        /** Save the live game snapshot to the requested slot when possible. */
        saveSnapshot(game, slot = '1') {
            if (!persistence?.saveSnapshot) return null;
            return persistence.saveSnapshot(game, slot);
        },

        /** Load a snapshot with Hex hydration support; returns defaults when missing. */
        loadSnapshot(slot = '1') {
            if (!persistence?.loadSnapshot) {
                return { state: null, stats: { ...defaultStats }, slot: String(slot) };
            }
            return persistence.loadSnapshot(slot, { hexFactory: safeHexFactory });
        },

        /** Clear stored progress and return fresh stats for a new campaign. */
        resetSnapshots() {
            if (persistence?.clearSnapshot) {
                persistence.clearSnapshot();
            }
            return { slot: '1', stats: { ...defaultStats } };
        },

        normalizeStats,
        replayNotifications
    };
}

export default createPersistenceService;
