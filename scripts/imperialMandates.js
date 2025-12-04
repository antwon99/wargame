/**
 * Imperial mandate manager.
 *
 * Tracks mandate lifecycles with shared status values, deadline-aware issuance,
 * and event-driven completion callbacks. Mandates are registered once and
 * evaluated against recorded events so new hooks (UI, combat, economy) can
 * subscribe without duplicating mandate logic.
 */
(function (global) {
    const RebelSystem = (global.RebelSystem)
        || (typeof require === 'function' ? require('./rebelSystem.js') : {});
    const TutorialCallouts = (global.TutorialCallouts)
        || (typeof require === 'function' ? require('./tutorialCallouts.js') : null);
    function getNotificationStackApi() {
        return global.NotificationStackApi || null;
    }

    const MandateStatus = {
        PENDING: 'PENDING',
        ACTIVE: 'ACTIVE',
        SUCCEEDED: 'SUCCEEDED',
        FAILED: 'FAILED',
        EXPIRED: 'EXPIRED'
    };

    const state = {
        mandates: new Map(),
        currentTick: 0,
        events: [],
        lastIssuedTick: null,
        lastGameState: null,
        lastUIBindings: {}
    };

    /**
     * Timekeeper-aligned helpers to keep mandate pacing in calendar units while
     * storing the authoritative timers in ticks.
     */
    const DEFAULT_TIME_CONFIG = { daysPerWeek: 7, weeksPerMonth: 4 };
    function getTimeConfig(gameState) {
        const tk = gameState?.timekeeper;
        return {
            daysPerWeek: Number.isFinite(tk?.daysPerWeek) ? tk.daysPerWeek : DEFAULT_TIME_CONFIG.daysPerWeek,
            weeksPerMonth: Number.isFinite(tk?.weeksPerMonth)
                ? tk.weeksPerMonth
                : DEFAULT_TIME_CONFIG.weeksPerMonth
        };
    }

    function convertToTicks(units = {}, gameState) {
        if (!units || typeof units !== 'object') return 0;
        const config = getTimeConfig(gameState);
        const monthsToDays = (units.months || 0) * config.weeksPerMonth * config.daysPerWeek;
        const weeksToDays = (units.weeks || 0) * config.daysPerWeek;
        return Math.max(0, (units.days || 0) + weeksToDays + monthsToDays);
    }

    function getCalendarForTick(tick, gameState) {
        const config = getTimeConfig(gameState);
        const safeTicks = Math.max(0, Number.isFinite(tick) ? tick : 0);
        const day = safeTicks + 1;
        const week = Math.floor((day - 1) / config.daysPerWeek);
        const month = Math.floor(week / config.weeksPerMonth) + 1;
        const weekOfMonth = (week % config.weeksPerMonth) + 1;
        const dayOfWeek = ((day - 1) % config.daysPerWeek) + 1;
        return { dayOfWeek, weekOfMonth, month, day };
    }

    function formatCalendarLabel(tick, gameState) {
        const cal = getCalendarForTick(tick, gameState);
        return `Month ${cal.month}, Week ${cal.weekOfMonth}, Day ${cal.dayOfWeek}`;
    }

    function getMinimumMandateSpacing(gameState) {
        return getTimeConfig(gameState).daysPerWeek;
    }

    function getDurationTicks(entry, ctx) {
        if (entry.definition.duration) return convertToTicks(entry.definition.duration, ctx.gameState);
        if (entry.definition.durationTicks) return entry.definition.durationTicks;
        return null;
    }

    function getEarliestIssueTick(entry, gameState) {
        if (!entry.definition.earliestIssue) return 0;
        return convertToTicks(entry.definition.earliestIssue, gameState);
    }

    function hasMandateSpacingElapsed(gameState) {
        if (state.lastIssuedTick === null) return true;
        const minGap = getMinimumMandateSpacing(gameState);
        return (state.currentTick - state.lastIssuedTick) >= minGap;
    }

    function getTileKey(tile) {
        if (!tile) return null;
        if (tile.hex && typeof tile.hex.toString === 'function') return tile.hex.toString();
        if (typeof tile.toString === 'function') return tile.toString();
        return null;
    }

    function resetTrackedRebel(tile, gameState) {
        if (!tile) return;
        tile.isRebelCamp = false;
        if (tile.type === 'rebelcamp') tile.type = tile.prevType || 'field';
        const tileKey = getTileKey(tile);
        if (tileKey && gameState?.overworld?.hexes) {
            gameState.overworld.hexes.set(tileKey, tile);
        }
    }

    function createLineElement(text) {
        const line = document.createElement('p');
        line.className = 'imperial-line';
        line.innerText = text;
        return line;
    }

    function renderImperialModal(config) {
        const { title, lines, buttonLabel, onConfirm, duration } = config;
        if (typeof document === 'undefined') {
            if (typeof onConfirm === 'function') onConfirm();
            return;
        }

        const backdrop = document.createElement('div');
        backdrop.className = 'imperial-modal-backdrop';

        const panel = document.createElement('div');
        panel.className = 'imperial-modal-panel';

        const heading = document.createElement('h3');
        heading.className = 'imperial-modal-title';
        heading.innerText = title;
        panel.appendChild(heading);

        (lines || []).forEach((text) => panel.appendChild(createLineElement(text)));

        if (buttonLabel !== null && buttonLabel !== false) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'imperial-modal-btn';
            btn.innerText = buttonLabel || 'Understood';
            btn.addEventListener('click', () => {
                backdrop.remove();
                if (typeof onConfirm === 'function') onConfirm();
            });
            panel.appendChild(btn);
        }

        backdrop.appendChild(panel);
        document.body.appendChild(backdrop);

        if (buttonLabel === null || buttonLabel === false) {
            const timeout = typeof duration === 'number' ? duration : 4000;
            setTimeout(() => backdrop.remove(), timeout);
        }
    }

    function showImperialMessage(config, uiBindings) {
        if (uiBindings?.showImperialModal) {
            uiBindings.showImperialModal(config);
            return;
        }
        renderImperialModal(config);
    }

    function getNotificationEnqueue(uiBindings = {}) {
        if (typeof uiBindings.enqueueNotification === 'function') return uiBindings.enqueueNotification;
        if (typeof uiBindings.notificationManager?.enqueue === 'function') return uiBindings.notificationManager.enqueue;
        if (typeof state.lastUIBindings.enqueueNotification === 'function') return state.lastUIBindings.enqueueNotification;
        if (typeof state.lastUIBindings.notificationManager?.enqueue === 'function') {
            return state.lastUIBindings.notificationManager.enqueue;
        }
        const shared = getNotificationStackApi()?.getSharedStack?.();
        if (shared?.enqueue) return shared.enqueue.bind(shared);
        return null;
    }

    function queueImperialNotification(lines, uiBindings, { title, duration, tone } = {}) {
        const enqueue = getNotificationEnqueue(uiBindings);
        if (!enqueue) return false;
        enqueue({
            title: title || 'By Imperial Decree:',
            lines: Array.isArray(lines) ? lines : [lines],
            duration,
            tone
        });
        return true;
    }

    const IMPERIAL_DECREE_POOL = [
        ['By command of the Emperor, do not relent.'],
        ['Rebel forces regroup in the shadows. Stay alert.'],
        ['Expand, fortify, and remind them who owns these lands.'],
        ['Imperial scribes note your progress. Continue the march.']
    ];

    function getImperialDecreeLines(lines) {
        if (Array.isArray(lines) && lines.length) return lines;
        const randomIndex = Math.floor(Math.random() * IMPERIAL_DECREE_POOL.length);
        return IMPERIAL_DECREE_POOL[randomIndex];
    }

    function showStandardImperialDecree(lines, uiBindings, { duration, title = 'By Imperial Decree:' } = {}) {
        showImperialMessage({
            title,
            lines: getImperialDecreeLines(lines),
            buttonLabel: null,
            duration
        }, uiBindings);
    }

    /**
     * Lightweight helper for mandate banners that should not block gameplay.
     * Falls back to the standard decree overlay with a short timeout.
     */
    function showMandateBanner(lines, uiBindings, title = 'By Imperial Decree:', durationOrOptions = 4200) {
        const options = typeof durationOrOptions === 'object'
            ? {
                duration: typeof durationOrOptions.duration === 'number'
                    ? durationOrOptions.duration
                    : durationOrOptions.timeout,
                tone: durationOrOptions.tone
            }
            : { duration: durationOrOptions };

        const normalizedLines = Array.isArray(lines) ? lines : [lines];
        const handled = queueImperialNotification(normalizedLines, uiBindings, { ...options, title });
        if (!handled) {
            showStandardImperialDecree(normalizedLines, uiBindings, { title, duration: options.duration });
        }
    }

    function showRebelDecreeCallout(rebelTile, gameState, uiBindings = {}, options = {}) {
        const { autoHide = false, title = 'By Imperial Decree:' } = options;
        const bodyHtml = options.body
            || 'Patrol the frontier.<br>Rebels have been sighted nearby.<br>Expand the Empire\'s reach — and survive the rebels beyond the fog.';

        const showTileCallout = uiBindings.showTileCallout
            || (TutorialCallouts && TutorialCallouts.showTileCallout);
        const hideTileCallout = uiBindings.hideTileCallout
            || (TutorialCallouts && TutorialCallouts.hideTileCallout);

        if (typeof showTileCallout === 'function') {
            const calloutOptions = {
                title,
                body: bodyHtml,
                buttonText: 'Understood',
                duration: autoHide ? 5000 : null,
                onConfirm: () => {
                    if (typeof hideTileCallout === 'function') hideTileCallout();
                }
            };

            const expectsGameFirst = showTileCallout.length >= 3;
            if (expectsGameFirst) {
                showTileCallout(gameState, rebelTile, calloutOptions);
            } else {
                showTileCallout(rebelTile, calloutOptions);
            }
            return;
        }

        showImperialMessage({
            title,
            lines: bodyHtml.split('<br>'),
            buttonLabel: 'Understood',
            onConfirm: () => {
                if (typeof hideTileCallout === 'function') hideTileCallout();
            }
        }, uiBindings);
    }

    function snapshotMandate(entry) {
        return {
            id: entry.definition.id,
            title: entry.definition.title,
            description: entry.definition.description,
            status: entry.runtime.status,
            deadlineTick: entry.runtime.deadlineTick,
            issuedTick: entry.runtime.issuedTick,
            metadata: { ...entry.runtime.metadata }
        };
    }

    /**
     * Generate a persistence-friendly snapshot of the mandate runtime state.
     * @returns {{ mandates: object, currentTick: number, lastIssuedTick: number|null }}
     */
    function serializeState() {
        const mandates = {};
        state.mandates.forEach((entry) => { mandates[entry.definition.id] = snapshotMandate(entry); });
        return {
            mandates,
            currentTick: state.currentTick,
            lastIssuedTick: state.lastIssuedTick
        };
    }

    /**
     * Restore mandate runtime fields from a persisted snapshot.
     * @param {object|null} snapshot hydrated payload from persistence.
     * @param {object} [gameState] optional live game reference for immediate trigger evaluation.
     */
    function hydrateState(snapshot, gameState) {
        resetForNewCampaign();
        if (!snapshot) return;
        state.currentTick = Math.max(0, Number.isFinite(snapshot.currentTick) ? snapshot.currentTick : 0);
        state.lastIssuedTick = Number.isFinite(snapshot.lastIssuedTick) ? snapshot.lastIssuedTick : null;
        const mandates = snapshot.mandates || {};
        Object.keys(mandates).forEach((id) => {
            const runtime = mandates[id];
            const entry = state.mandates.get(id);
            if (!entry) return;
            resetMandate(entry);
            entry.runtime.status = runtime.status || MandateStatus.PENDING;
            entry.runtime.deadlineTick = Number.isFinite(runtime.deadlineTick) ? runtime.deadlineTick : null;
            entry.runtime.issuedTick = Number.isFinite(runtime.issuedTick) ? runtime.issuedTick : null;
            if (runtime.metadata && typeof runtime.metadata === 'object') {
                entry.runtime.metadata = { ...entry.runtime.metadata, ...runtime.metadata };
            }
        });
        if (gameState) state.lastGameState = gameState;
    }

    function buildContext(gameState, uiBindings, payload) {
        if (gameState) state.lastGameState = gameState;
        if (uiBindings) state.lastUIBindings = { ...state.lastUIBindings, ...uiBindings };
        return {
            gameState: state.lastGameState,
            uiBindings: state.lastUIBindings,
            payload,
            currentTick: state.currentTick
        };
    }

    /**
     * Register a new mandate definition with the manager.
     * Mandates remain dormant until their trigger predicate is satisfied.
     * @param {object} definition structured mandate blueprint with predicates and callbacks.
     */
    function registerMandate(definition) {
        if (!definition || !definition.id) throw new Error('Mandate definitions require an id');
        const runtime = {
            status: MandateStatus.PENDING,
            deadlineTick: null,
            issuedTick: null,
            metadata: typeof definition.createInitialState === 'function'
                ? definition.createInitialState()
                : {},
            reprimandShown: false
        };
        state.mandates.set(definition.id, { definition, runtime });
    }

    function resetMandate(entry) {
        entry.runtime.status = MandateStatus.PENDING;
        entry.runtime.deadlineTick = null;
        entry.runtime.issuedTick = null;
        entry.runtime.metadata = typeof entry.definition.createInitialState === 'function'
            ? entry.definition.createInitialState()
            : {};
        entry.runtime.reprimandShown = false;
    }

    /**
     * Reset mandate runtime state for a fresh campaign.
     * Preserves registered mandate definitions while clearing history and timers.
     */
    function resetForNewCampaign() {
        state.currentTick = 0;
        state.events = [];
        state.lastIssuedTick = null;
        state.lastGameState = null;
        state.lastUIBindings = {};
        state.mandates.forEach(resetMandate);
    }

    function markSuccess(entry, ctx, payload) {
        entry.runtime.status = MandateStatus.SUCCEEDED;
        entry.runtime.completedTick = state.currentTick;
        if (typeof entry.definition.onSuccess === 'function') {
            entry.definition.onSuccess({ ...ctx, mandate: entry, payload });
        }
    }

    function markFailure(entry, ctx, payload) {
        entry.runtime.status = MandateStatus.FAILED;
        entry.runtime.completedTick = state.currentTick;
        if (typeof entry.definition.onFailure === 'function') {
            entry.definition.onFailure({ ...ctx, mandate: entry, payload });
        }
    }

    function issueMandate(entry, ctx) {
        entry.runtime.status = MandateStatus.ACTIVE;
        entry.runtime.issuedTick = state.currentTick;
        const durationTicks = getDurationTicks(entry, ctx);
        if (durationTicks) {
            entry.runtime.durationTicks = durationTicks;
            entry.runtime.deadlineTick = state.currentTick + durationTicks;
        }
        state.lastIssuedTick = state.currentTick;
        if (typeof entry.definition.onIssue === 'function') {
            entry.definition.onIssue({ ...ctx, mandate: entry });
        }
    }

    function getDeadlineWarningLines(entry, ticksRemaining, ctx) {
        const deadlineLabel = formatCalendarLabel((entry.runtime.deadlineTick || state.currentTick) - 1, ctx.gameState);
        if (entry.definition.id === 'levy_tithed_gold') {
            return [
                `Levy due by ${deadlineLabel} (${ticksRemaining} days remaining).`,
                'Secure the tithe before collectors arrive.'
            ];
        }
        if (entry.definition.id === 'push_the_frontier') {
            return [
                `Frontier mandate expires by ${deadlineLabel} (${ticksRemaining} days remaining).`,
                'Claim new holdings before the order lapses.'
            ];
        }
        return [`Mandate deadline by ${deadlineLabel} (${ticksRemaining} days remaining).`];
    }

    function checkDeadlines(ctx) {
        state.mandates.forEach((entry) => {
            if (entry.runtime.status !== MandateStatus.ACTIVE) return;

            const deadlineTick = entry.runtime.deadlineTick;
            if (!deadlineTick) return;

            const ticksRemaining = deadlineTick - state.currentTick;

            if (ticksRemaining > 0 && ticksRemaining <= 2 && !entry.runtime.metadata.deadlineWarned) {
                entry.runtime.metadata.deadlineWarned = true;
                showMandateBanner(
                    getDeadlineWarningLines(entry, ticksRemaining, ctx),
                    ctx.uiBindings,
                    'Imperial Reminder',
                    { duration: 4600, tone: 'warning' }
                );
            }

            if (state.currentTick >= deadlineTick) {
                markFailure(entry, ctx);
            }
        });
    }

    function evaluateMandate(entry, eventType, payload, ctx) {
        if (entry.runtime.status !== MandateStatus.ACTIVE) return;
        if (entry.definition.onEvent) {
            entry.definition.onEvent(eventType, payload, { ...ctx, mandate: entry });
            if (entry.runtime.status !== MandateStatus.ACTIVE) return;
        }

        if (entry.definition.successPredicate
            && entry.definition.successPredicate(eventType, payload, { ...ctx, mandate: entry })) {
            markSuccess(entry, ctx, payload);
            return;
        }

        if (entry.definition.failurePredicate
            && entry.definition.failurePredicate(eventType, payload, { ...ctx, mandate: entry })) {
            markFailure(entry, ctx, payload);
        }
    }

    /**
     * Evaluate all pending mandates and activate those whose trigger predicate passes.
     * @param {object} gameState live game state reference.
     * @param {object} [uiBindings] optional UI hooks for modals/callouts.
     * @returns {Array} list of active mandate snapshots after evaluation.
     */
    function issuePendingMandates(gameState, uiBindings = {}) {
        const ctx = buildContext(gameState, uiBindings);
        state.mandates.forEach((entry) => {
            if (entry.runtime.status !== MandateStatus.PENDING) return;
            if (!hasMandateSpacingElapsed(ctx.gameState)) return;
            if (ctx.currentTick < getEarliestIssueTick(entry, ctx.gameState)) return;
            if (entry.definition.triggerPredicate && entry.definition.triggerPredicate({ ...ctx, mandate: entry })) {
                issueMandate(entry, ctx);
            }
        });
        return getActiveMandates();
    }

    /**
     * Record a gameplay event and advance mandate lifecycles.
     * Tick events advance the internal clock; all events re-run success/failure predicates.
     * @param {string} eventType semantic label (tick, battle_outcome, tile_cleared, etc.).
     * @param {object} [payload] event payload forwarded to mandate predicates.
     * @param {object} [gameState] optional live game state reference.
     * @param {object} [uiBindings] optional UI hooks for messaging.
     */
    function recordEvent(eventType, payload = {}, gameState, uiBindings) {
        const ctx = buildContext(gameState || payload?.gameState, uiBindings);
        if (eventType === 'tick') {
            const ticks = typeof payload.ticks === 'number' ? payload.ticks : 1;
            state.currentTick += ticks;
        }

        state.events.push({ eventType, payload, tick: state.currentTick });
        state.events = state.events.slice(-25);

        checkDeadlines(ctx);
        state.mandates.forEach((entry) => evaluateMandate(entry, eventType, payload, ctx));
        issuePendingMandates(ctx.gameState, ctx.uiBindings);
    }

    /**
     * Retrieve active mandates in snapshot form for UI overlays or diagnostics.
     * @returns {Array} shallow copies of active mandate runtime data.
     */
    function getActiveMandates() {
        return Array.from(state.mandates.values())
            .filter((entry) => entry.runtime.status === MandateStatus.ACTIVE)
            .map(snapshotMandate);
    }

    /**
     * Expose overworld keys guarded by active mandates so other systems can respect them.
     * @returns {Set<string>} collection of protected tile keys.
     */
    function getProtectedOverworldKeys() {
        const protectedKeys = new Set();
        state.mandates.forEach((entry) => {
            if (entry.runtime.status !== MandateStatus.ACTIVE) return;
            if (entry.runtime.metadata?.targetTileKey) protectedKeys.add(entry.runtime.metadata.targetTileKey);
        });
        return protectedKeys;
    }

    /**
     * Convenience wrapper for combat resolution to feed mandate telemetry.
     * @param {string} result outcome label (VICTORY|DEFEAT|RETREAT|REVIVE).
     * @param {object|null} targetTile overworld tile involved in the battle.
     * @param {object} gameState live game state.
     * @param {object} [uiBindings] optional UI hooks for decree rendering.
     */
    function handleBattleOutcome(result, targetTile, gameState, uiBindings = {}) {
        recordEvent('battle_outcome', { result, targetTile }, gameState, uiBindings);
    }

    /**
     * Forward tile clear events to mandate predicates without duplicating logic.
     * @param {object} tile cleared tile payload.
     * @param {object} gameState live game state reference.
     * @param {object} [uiBindings] optional UI hooks for decree rendering.
     */
    function handleTileCleared(tile, gameState, uiBindings = {}) {
        recordEvent('tile_cleared', { tile }, gameState, uiBindings);
    }

    /**
     * Legacy entry point preserved for existing bootstrap code.
     * Delegates to issuePendingMandates for compatibility.
     */
    function issueInitialMandate(gameState, uiBindings = {}) {
        return issuePendingMandates(gameState, uiBindings);
    }

    /**
     * Introspection helper primarily for tests and debugging overlays.
     * @returns {{ mandates: object, currentTick: number }} snapshot of mandate runtime data.
     */
    function getKingState() {
        const mandates = {};
        state.mandates.forEach((entry) => { mandates[entry.definition.id] = snapshotMandate(entry); });
        return {
            mandates,
            currentTick: state.currentTick,
            lastIssuedTick: state.lastIssuedTick
        };
    }

    // --- Mandate definitions ---
    function buildRebelMandate() {
        return {
            id: 'destroy_first_rebel_camp',
            title: 'Frontier Sweep',
            description: 'Destroy the first rebel encampment seeded near the foggy frontier before the Emperor loses patience.',
            duration: { weeks: 2, days: 1 },
            createInitialState: () => ({ targetTileKey: null, preferAnchoredDecree: true, deadlineWarned: false }),
            triggerPredicate: ({ gameState }) => Boolean(gameState?.overworld?.hexes?.size),
            onIssue: ({ gameState, uiBindings, mandate }) => {
                const rebelTile = RebelSystem.spawnRebelCampNearFrontier?.(gameState, { enemyLevel: 1 });
                if (!rebelTile) {
                    console.warn('Imperial mandate could not place a rebel camp.');
                    return;
                }

                mandate.runtime.metadata.targetTileKey = getTileKey(rebelTile);
                const body = 'Patrol the frontier.\nRebels have been sighted nearby.\nExpand the Empire\'s reach — and survive the rebels beyond the fog.';
                const shouldAnchorToTile = mandate.runtime.metadata.preferAnchoredDecree
                    && typeof (uiBindings.showTileCallout || TutorialCallouts?.showTileCallout) === 'function';
                mandate.runtime.metadata.preferAnchoredDecree = false;

                if (shouldAnchorToTile) {
                    showRebelDecreeCallout(rebelTile, gameState, uiBindings, {
                        body: body.replace(/\n/g, '<br>'),
                        title: 'By Imperial Decree:'
                    });
                } else {
                    showMandateBanner(body.split('\n'), uiBindings, 'By Imperial Decree:');
                }
            },
            onEvent: (eventType, payload, ctx) => {
                const targetKey = ctx.mandate.runtime.metadata.targetTileKey;
                const trackedKey = getTileKey(payload?.targetTile || payload?.tile);
                if (eventType === 'battle_outcome' && trackedKey && trackedKey === targetKey) {
                    const result = (payload?.result || '').toUpperCase();
                    if ((result === 'DEFEAT' || result === 'REVIVE') && !ctx.mandate.runtime.reprimandShown) {
                        ctx.mandate.runtime.reprimandShown = true;
                        showMandateBanner([
                            'The frontier has been pushed back.',
                            'Regroup and destroy the encampment.'
                        ], ctx.uiBindings, 'Imperial Reprimand', { tone: 'warning' });
                    }
                }
            },
            successPredicate: (eventType, payload, ctx) => {
                const targetKey = ctx.mandate.runtime.metadata.targetTileKey;
                const trackedKey = getTileKey(payload?.targetTile || payload?.tile);
                if (!trackedKey || trackedKey !== targetKey) return false;

                if (eventType === 'battle_outcome') {
                    const result = (payload?.result || '').toUpperCase();
                    return result === 'VICTORY';
                }
                if (eventType === 'tile_cleared') return true;
                return false;
            },
            onSuccess: ({ payload, gameState, uiBindings }) => {
                const tile = payload?.targetTile || payload?.tile;
                resetTrackedRebel(tile, gameState);
                showMandateBanner([
                    'Expand the territory while the frontier is quiet.'
                ], uiBindings, 'The Emperor is pleased.', { tone: 'success', duration: 5200 });
            },
            failurePredicate: (eventType, payload, ctx) => {
                if (eventType !== 'tick') return false;
                return ctx.mandate.runtime.deadlineTick && state.currentTick >= ctx.mandate.runtime.deadlineTick;
            },
            onFailure: ({ uiBindings }) => {
                showMandateBanner([
                    'The encampment festers beyond the frontier.',
                    'Expect harsher levies until it is destroyed.'
                ], uiBindings, 'Imperial Patience Wanes');
            }
        };
    }

    function buildTaxLevyMandate() {
        return {
            id: 'levy_tithed_gold',
            title: 'Imperial Tax Levy',
            description: 'Deliver a gold tithe to the capital. Maintain reserves long enough for the courier to collect payment.',
            duration: { weeks: 1, days: 1 },
            createInitialState: () => ({ requiredGold: 0, deadlineWarned: false }),
            earliestIssue: { weeks: 1 },
            triggerPredicate: ({ gameState }) => (gameState?.gold || 0) >= 120,
            onIssue: ({ gameState, uiBindings, mandate }) => {
                const requiredGold = Math.max(150, Math.floor((gameState?.gold || 0) * 0.6));
                mandate.runtime.metadata.requiredGold = requiredGold;
                showMandateBanner([
                    `Levy announced: remit ${requiredGold} gold.`,
                    `Collectors arrive by ${formatCalendarLabel((mandate.runtime.deadlineTick || state.currentTick) - 1, gameState)}.`
                ], uiBindings, 'Imperial Tax Levy');
            },
            successPredicate: (eventType, payload, ctx) => {
                if (eventType !== 'tick') return false;
                const gold = ctx.gameState?.gold || 0;
                const required = ctx.mandate.runtime.metadata.requiredGold;
                return gold >= required;
            },
            onSuccess: ({ gameState, uiBindings, mandate }) => {
                const required = mandate.runtime.metadata.requiredGold;
                if (typeof gameState?.gold === 'number') {
                    gameState.gold -= required;
                    gameState.gold = Math.max(0, gameState.gold);
                    gameState.gold += Math.floor(required * 0.4);
                }
                showMandateBanner([
                    'Levy received. Couriers return with 40% of the tithe.',
                    'Imperial trust in your stewardship grows.'
                ], uiBindings, 'Levy Received');
            },
            failurePredicate: (eventType, payload, ctx) => {
                if (eventType !== 'tick') return false;
                return ctx.mandate.runtime.deadlineTick && state.currentTick >= ctx.mandate.runtime.deadlineTick;
            },
            onFailure: ({ gameState, uiBindings, mandate }) => {
                if (typeof gameState?.gold === 'number') {
                    gameState.gold = Math.max(0, gameState.gold - Math.floor(mandate.runtime.metadata.requiredGold * 0.35));
                }
                showMandateBanner([
                    'Levy missed. Treasury agents seize local stores.',
                    'Future levies will be stricter if delays continue.'
                ], uiBindings, 'Levy Missed');
            }
        };
    }

    function buildExpansionMandate() {
        return {
            id: 'push_the_frontier',
            title: 'Push the Frontier',
            description: 'Claim additional territory before the frontier stagnates. Expansion proves loyalty.',
            duration: { weeks: 1, days: 5 },
            createInitialState: () => ({ startingTerritory: 0, targetTerritory: 0, deadlineWarned: false }),
            earliestIssue: { weeks: 2 },
            triggerPredicate: ({ gameState }) => (gameState?.overworld?.hexes?.size || 0) >= 4,
            onIssue: ({ gameState, uiBindings, mandate }) => {
                const currentTerritory = gameState?.overworld?.hexes?.size || 0;
                mandate.runtime.metadata.startingTerritory = currentTerritory;
                mandate.runtime.metadata.targetTerritory = currentTerritory + 3;
                showMandateBanner([
                    `Add ${mandate.runtime.metadata.targetTerritory - currentTerritory} holdings before the fog closes in.`,
                    'New towns will earn a small signing bonus.'
                ], uiBindings, 'Push the Frontier');
            },
            successPredicate: (eventType, payload, ctx) => {
                if (eventType !== 'tick') return false;
                const owned = ctx.gameState?.overworld?.hexes?.size || 0;
                return owned >= ctx.mandate.runtime.metadata.targetTerritory;
            },
            onSuccess: ({ gameState, uiBindings, mandate }) => {
                if (typeof gameState?.gold === 'number') gameState.gold += 75;
                if (typeof gameState?.wood === 'number') gameState.wood += 40;
                showMandateBanner([
                    'Frontier secured. Imperial cartographers commend your expansion.',
                    'Supplies arrive: +75 gold, +40 wood.'
                ], uiBindings, 'Frontier Secured');
            },
            failurePredicate: (eventType, payload, ctx) => {
                if (eventType !== 'tick') return false;
                return ctx.mandate.runtime.deadlineTick && state.currentTick >= ctx.mandate.runtime.deadlineTick;
            },
            onFailure: ({ uiBindings }) => {
                showMandateBanner([
                    'Frontier mandate stalled. Scouts report hesitation at the border.',
                    'Expect stronger rebel pressure until expansion resumes.'
                ], uiBindings, 'Frontier Stalls');
            }
        };
    }

    registerMandate(buildRebelMandate());
    registerMandate(buildTaxLevyMandate());
    registerMandate(buildExpansionMandate());

    const api = {
        MandateStatus,
        registerMandate,
        issuePendingMandates,
        recordEvent,
        getActiveMandates,
        resetForNewCampaign,
        getKingState,
        getProtectedOverworldKeys,
        showRebelDecreeCallout,
        handleBattleOutcome,
        handleTileCleared,
        issueInitialMandate,
        serializeState,
        hydrateState
    };

    global.ImperialMandates = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
