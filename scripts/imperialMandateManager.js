/**
 * Non-blocking coordinator for imperial mandate ticks.
 *
 * Queues tick events so mandate evaluations (issue/expiry/rewards) happen
 * asynchronously, preventing UI overlays from freezing player input while still
 * driving deadlines from the authoritative tick counter.
 */
(function (global) {
    function resolveImperialMandates() {
        if (global.ImperialMandates) return global.ImperialMandates;
        if (typeof require === 'function') {
            try {
                return require('./imperialMandates.js');
            } catch (error) {
                return null;
            }
        }
        return null;
    }

    let queuedTicks = 0;
    let scheduled = false;
    let cachedGameState = null;
    let cachedUIBindings = {};

    function cacheContext(gameState, uiBindings = {}) {
        cachedGameState = gameState || cachedGameState;
        cachedUIBindings = { ...cachedUIBindings, ...uiBindings };
        return { gameState: cachedGameState, uiBindings: cachedUIBindings };
    }

    function flushTicks(gameState, uiBindings) {
        scheduled = false;
        const ImperialMandates = resolveImperialMandates();
        if (!ImperialMandates?.recordEvent) {
            queuedTicks = 0;
            return;
        }
        if (!queuedTicks) return;

        const ticksToApply = queuedTicks;
        queuedTicks = 0;
        ImperialMandates.recordEvent('tick', { ticks: ticksToApply, gameState }, gameState, uiBindings);
    }

    /**
     * Advance the imperial mandate tick counter without blocking the current frame.
     * Tick evaluations run on the next macrotask to avoid interfering with player input.
     * @param {object} gameState live game state reference.
     * @param {object} [uiBindings] optional UI hooks for decree rendering.
     */
    function advanceTick(gameState, uiBindings = {}) {
        cacheContext(gameState, uiBindings);
        queuedTicks += 1;
        if (scheduled) return;
        scheduled = true;

        const dispatch = () => {
            const ctx = cacheContext();
            flushTicks(ctx.gameState, ctx.uiBindings);
        };

        if (typeof setTimeout === 'function') {
            setTimeout(dispatch, 0);
        } else {
            dispatch();
        }
    }

    /**
     * Reset queued ticks and cached bindings for a new campaign or test harness.
     */
    function reset() {
        queuedTicks = 0;
        scheduled = false;
        cachedGameState = null;
        cachedUIBindings = {};
    }

    const api = { advanceTick, reset };

    global.ImperialMandateManager = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
