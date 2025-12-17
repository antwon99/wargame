import PersistenceModule from '../persistence.js';

/**
 * Build a persistence-aware campaign store that orchestrates saving, loading,
 * and resetting campaigns without forcing callers to juggle Persistence
 * directly. Dependencies are injected so tests and alternate runtimes can
 * supply adapters or mock behaviors.
 *
 * @param {object} deps dependency bag
 * @param {Function} deps.snapshotter returns the current game instance or a serializable snapshot
 * @param {Function} deps.applier applies a hydrated snapshot back onto the live game
 * @param {Function} [deps.notifier] optional hook invoked with (event, payload) for UX updates
 * @param {Function} [deps.hudUpdater] optional hook invoked with (event, payload) when UI should refresh
 * @param {Storage|object|null} [deps.settingsStorage] optional storage backing to swap into Persistence
 * @param {Function} [deps.hexFactory] factory for reconstructing hex coordinates during load
 * @param {Function} [deps.resetter] optional callback invoked during campaign resets
 * @returns {{saveSlot: Function, loadSlot: Function, resetCampaign: Function, hydrateStats: Function}}
 */
export function createCampaignStore({
    snapshotter,
    applier,
    notifier,
    hudUpdater,
    settingsStorage,
    hexFactory,
    resetter
} = {}) {
    const Persistence = PersistenceModule || (typeof window !== 'undefined' ? window.Persistence : null);
    const persistenceAvailable = Boolean(Persistence);
    const normalizeStats = Persistence?.StatHelpers?.normalizeStats;
    const defaultStats = Persistence?.DEFAULT_STATS || {
        bestLevel: 0,
        bestKills: 0,
        totalKills: 0,
        warsFought: 0,
        lastOutcome: 'N/A',
        lastSaveISO: null
    };

    if (Persistence?.createStorageAdapter && Persistence?.setStorageAdapter && settingsStorage) {
        Persistence.setStorageAdapter(Persistence.createStorageAdapter(settingsStorage));
    }

    const hydrateStats = (stats = {}) => (typeof normalizeStats === 'function' ? normalizeStats(stats) : { ...defaultStats, ...stats });

    const emit = (event, payload = {}) => {
        if (typeof notifier === 'function') notifier(event, payload);
        if (typeof hudUpdater === 'function') hudUpdater(event, payload);
    };

    const applySnapshot = (state, stats, slot) => {
        if (typeof applier === 'function' && state) applier(state, stats, slot);
    };

    const saveSlot = (slot = '1', options = {}) => {
        const targetSlot = String(slot || '1');
        if (!persistenceAvailable) {
            if (!options.quiet) emit('unavailable', { slot: targetSlot });
            return { ok: false, slot: targetSlot };
        }
        const source = typeof snapshotter === 'function' ? snapshotter() : null;
        const result = Persistence.saveSnapshot(source, targetSlot);
        const stats = hydrateStats(result.payload?.stats);
        if (!options.quiet) emit('save', { ...result, stats });
        return { ...result, stats, ok: true };
    };

    const loadSlot = (slot = '1', options = {}) => {
        const targetSlot = String(slot || '1');
        if (!persistenceAvailable) {
            if (!options.quiet) emit('unavailable', { slot: targetSlot });
            return { state: null, stats: hydrateStats(), slot: targetSlot, ok: false };
        }
        const loaded = Persistence.loadSnapshot(targetSlot, { hexFactory });
        const stats = hydrateStats(loaded.stats);
        if (loaded.state) {
            applySnapshot(loaded.state, stats, loaded.slot);
            if (!options.quiet) emit('load', { ...loaded, stats });
            return { ...loaded, stats, ok: true };
        }
        if (!options.quiet) emit('load:missing', { ...loaded, stats });
        return { ...loaded, stats, ok: false };
    };

    const resetCampaign = (options = {}) => {
        if (persistenceAvailable) Persistence.clearSnapshot();
        const stats = hydrateStats(defaultStats);
        if (typeof resetter === 'function') resetter();
        if (!options.quiet) emit('reset', { slot: '1', stats });
        return { slot: '1', stats, ok: true };
    };

    return { saveSlot, loadSlot, resetCampaign, hydrateStats };
}

export default createCampaignStore;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createCampaignStore };
}
