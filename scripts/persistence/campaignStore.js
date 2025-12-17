import Persistence from '../persistence.js';

const noop = () => {};

/**
 * Build a thin wrapper around Persistence that coordinates save/load/reset UI feedback.
 * The store operates on a minimal snapshot API so tests can inject mock persistence
 * layers without pulling the full Game singleton into scope.
 * @param {object} config configuration for persistence hooks.
 * @param {object} [config.persistence=Persistence] persistence helper exposing save/load/clear APIs.
 * @param {function} config.getSnapshot callback returning a serialized snapshot payload.
 * @param {function} config.applySnapshot hydrates a serialized snapshot back into Game state.
 * @param {function} [config.getStats] accessor for the current leaderboard stats payload.
 * @param {function} [config.setStats] setter for leaderboard stats.
 * @param {function} [config.getActiveSlot] accessor for the active save slot label.
 * @param {function} [config.setActiveSlot] setter for the active save slot label.
 * @param {function} [config.resetWorld] callback that reinitializes overworld state.
 * @param {function} [config.onStatus] callback for status/HUD messaging.
 * @param {function} [config.onSaveSlotsUpdate] callback to refresh save slot UI.
 * @param {function} [config.onHUDRefresh] callback to refresh HUD state.
 * @param {function} [config.onUpgradeRefresh] callback to refresh upgrade UI.
 * @param {function} [config.onResearchRefresh] callback to refresh research UI.
 * @param {function} [config.onLeaderboardRefresh] callback to refresh leaderboard UI.
 * @param {function} [config.onNotificationsHydrated] callback to replay persisted notifications.
 * @param {function} [config.onSidebarToggle] callback to toggle the sidebar.
 * @param {function} [config.onToast] callback to emit floating text/toast feedback.
 * @param {function} [config.onWarning] callback for non-fatal warnings when persistence is unavailable.
 * @param {function} [config.onImperialReset] callback to reset imperial mandate state.
 * @param {function} [config.onIntroReset] callback to reset the intro overlay state.
 * @returns {{save: function, load: function, reset: function}}
 */
export function createCampaignStore({
    persistence = Persistence,
    getSnapshot,
    applySnapshot,
    getStats = () => ({}),
    setStats = noop,
    getActiveSlot = () => '1',
    setActiveSlot = noop,
    resetWorld = noop,
    onStatus = noop,
    onSaveSlotsUpdate = noop,
    onHUDRefresh = noop,
    onUpgradeRefresh = noop,
    onResearchRefresh = noop,
    onLeaderboardRefresh = noop,
    onNotificationsHydrated = noop,
    onSidebarToggle = noop,
    onToast = noop,
    onWarning = noop,
    onImperialReset = noop,
    onIntroReset = noop
} = {}) {
    const withStatus = (message, shouldEmitStatus) => {
        if (!shouldEmitStatus) return;
        onStatus(message);
    };

    const ensurePersistence = () => {
        if (!persistence) {
            onWarning('Persistence unavailable; skipping save/load request.');
            return false;
        }
        return true;
    };

    /**
     * Persist the current campaign snapshot to a slot.
     * @param {object} [options]
     * @param {string|number} [options.slot] desired save slot.
     * @param {boolean} [options.suppressToast=false] disable toast/status feedback.
     * @returns {{savedAt: string, payload: object, slot: string}|null}
     */
    function save({ slot = getActiveSlot(), suppressToast = false } = {}) {
        if (!ensurePersistence() || typeof getSnapshot !== 'function') return null;
        const targetSlot = String(slot || getActiveSlot());
        const result = persistence.saveSnapshot(getSnapshot(), targetSlot);
        setActiveSlot(result.slot);
        const formattedTime = new Date(result.savedAt).toLocaleString();
        if (!suppressToast) {
            withStatus(`Saved Slot ${result.slot} @ ${formattedTime}`, true);
            onSaveSlotsUpdate();
            onToast('Progress Saved', '#9be3b4');
        }
        return result;
    }

    /**
     * Load a campaign snapshot from a slot and refresh dependent UI surfaces.
     * @param {object} [options]
     * @param {string|number} [options.slot] desired slot to hydrate.
     * @param {object} [options.deserializerOptions] passthrough options for snapshot deserialization.
     * @param {boolean} [options.suppressToast=false] disable toast feedback.
     * @param {boolean} [options.suppressStatus=false] disable status label updates on failure.
     * @param {boolean} [options.refreshUI=true] disable downstream UI refreshes when false.
     * @returns {{state: object|null, stats: object, slot: string}}
     */
    function load({
        slot = getActiveSlot(),
        deserializerOptions = {},
        suppressToast = false,
        suppressStatus = false,
        refreshUI = true
    } = {}) {
        if (!ensurePersistence()) {
            return { state: null, stats: getStats(), slot: String(slot || getActiveSlot()) };
        }
        const targetSlot = String(slot || getActiveSlot());
        const loaded = persistence.loadSnapshot(targetSlot, deserializerOptions);
        if (!loaded.state) {
            if (!suppressToast) onToast(`No Save In Slot ${targetSlot}`, '#ef476f');
            withStatus('No save stored yet.', !suppressStatus);
            if (refreshUI) onSaveSlotsUpdate();
            return { ...loaded, slot: targetSlot };
        }

        setActiveSlot(loaded.slot || targetSlot);
        applySnapshot(loaded.state);
        setStats(loaded.stats);
        if (refreshUI) {
            onHUDRefresh();
            onUpgradeRefresh();
            onResearchRefresh();
            onLeaderboardRefresh();
            onSaveSlotsUpdate();
            onNotificationsHydrated();
            onSidebarToggle(false);
        }
        if (!suppressToast) onToast(`Loaded Slot ${getActiveSlot()}`, '#9be3b4');
        return loaded;
    }

    /**
     * Clear campaign data and rebuild the overworld.
     * @param {object} [options]
     * @param {boolean} [options.suppressToast=false] disable toast feedback.
     * @param {boolean} [options.refreshUI=true] disable downstream UI refreshes when false.
     */
    function reset({ suppressToast = false, refreshUI = true } = {}) {
        if (!ensurePersistence()) return;
        persistence.clearSnapshot();
        setStats({ ...(persistence.DEFAULT_STATS || {}) });
        setActiveSlot('1');
        onImperialReset();
        resetWorld();
        if (refreshUI) {
            onLeaderboardRefresh();
            onHUDRefresh();
            onUpgradeRefresh();
            onSaveSlotsUpdate();
            onSidebarToggle(false);
        }
        if (!suppressToast) onToast('Progress Reset', '#ffd166');
        onIntroReset();
    }

    return { save, load, reset };
}

export default createCampaignStore;
