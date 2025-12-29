function buildUiAdapter(adapter = {}, getLastBindings = () => ({})) {
    const fallback = {
        withImperialAudioGuard: (fn) => (typeof fn === 'function' ? fn() : null),
        sanitizeUIBindings: (uiBindings = {}) => (uiBindings && typeof uiBindings === 'object' ? uiBindings : {}),
        showImperialMessage: () => null,
        renderImperialModal: () => null,
        queueImperialNotification: () => false,
        showMandateBanner: () => false,
        showRebelDecreeCallout: () => false
    };

    return {
        withImperialAudioGuard: adapter.withImperialAudioGuard || fallback.withImperialAudioGuard,
        sanitizeUIBindings: adapter.sanitizeUIBindings || fallback.sanitizeUIBindings,
        renderImperialModal: adapter.renderImperialModal || fallback.renderImperialModal,
        showImperialMessage: adapter.showImperialMessage || fallback.showImperialMessage,
        queueImperialNotification: (lines, uiBindings, options) => {
            if (typeof adapter.queueImperialNotification === 'function') {
                return adapter.queueImperialNotification(lines, uiBindings, options, getLastBindings());
            }
            return fallback.queueImperialNotification();
        },
        showMandateBanner: (lines, uiBindings, title, durationOrOptions) => {
            if (typeof adapter.showMandateBanner === 'function') {
                return adapter.showMandateBanner(lines, uiBindings, title, durationOrOptions, getLastBindings());
            }
            return fallback.showMandateBanner();
        },
        showRebelDecreeCallout: (rebelTile, gameState, uiBindings, options) => {
            if (typeof adapter.showRebelDecreeCallout === 'function') {
                return adapter.showRebelDecreeCallout(rebelTile, gameState, uiBindings, options, getLastBindings());
            }
            return fallback.showRebelDecreeCallout();
        }
    };
}

/**
 * Imperial mandate manager.
 *
 * Tracks mandate lifecycles with shared status values, deadline-aware issuance,
 * and event-driven completion callbacks. Mandates are registered once and
 * evaluated against recorded events so new hooks (UI, combat, economy) can
 * subscribe without duplicating mandate logic.
 */
function createImperialMandates(adapter = {}, runtimeGlobal = (typeof window !== 'undefined' ? window : globalThis)) {
    const global = runtimeGlobal;
    const RebelSystem = (global.RebelSystem)
        || (typeof require === 'function' ? require('../rebelSystem.js') : {});
    const TutorialCallouts = (global.TutorialCallouts)
        || (typeof require === 'function' ? require('../tutorialCallouts.js') : null);
    const MandateCalendar = (global.ImperialMandateCalendar)
        || (typeof require === 'function' ? require('./imperialMandateCalendar.js') : null);
    const ImperialMandateRegistry = (global.ImperialMandateRegistry)
        || (typeof require === 'function' ? require('./imperialMandateRegistry.js') : null);
    const imperialFavorHelpers = (typeof require === 'function')
        ? require('../imperialFavor.js')
        : global.ImperialFavor;
    const { DEFAULT_IMPERIAL_FAVOR = 5, clampImperialFavor = (value) => {
        const numeric = Number.isFinite(value) ? Math.round(value) : DEFAULT_IMPERIAL_FAVOR;
        return Math.min(10, Math.max(1, numeric));
    } } = imperialFavorHelpers || {};

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
        lastUIBindings: {},
        rebelSweep: { outcome: null, completionTick: null }
    };

    const uiAdapter = buildUiAdapter(adapter, () => state.lastUIBindings);

    const DEFAULT_REBEL_DECREE_LINES = [
        'Patrol the frontier.',
        'Rebels have been sighted nearby.',
        "Expand the Empire's reach — and survive the rebels beyond the fog."
    ];
    const DEFAULT_REBEL_DECREE_BODY = DEFAULT_REBEL_DECREE_LINES.join('<br>');

    /**
     * Locate a declarative mandate blueprint without coupling to runtime logic.
     * @param {string} id mandate identifier.
     * @returns {object|null} registry entry when found.
     */
    function getMandateBlueprint(id) {
        if (!Array.isArray(ImperialMandateRegistry)) return null;
        return ImperialMandateRegistry.find((entry) => entry.id === id) || null;
    }

    /**
     * Shield decree/notification rendering from combat stingers so overlays do not
     * stomp ambience or accidentally enter combat states while the UI is focused.
     * @param {Function} fn callback to execute while the guard is active.
     * @returns {*} return value from the guarded callback.
     */
    function withImperialAudioGuard(fn) {
        return uiAdapter.withImperialAudioGuard(fn);
    }

    /**
     * Scale mandate intensity and grace periods according to imperial favor so loyal vassals
     * enjoy lighter requests while neglectful ones face steeper, faster demands.
     * @param {object} gameState live game reference for favor lookup.
     * @returns {{ demandFactor: number, timeFactor: number }} multipliers for resource asks and deadlines.
     */
    function getFavorPacingAdjustments(gameState) {
        const favor = clampImperialFavor(gameState?.imperialFavor);
        const deltaFromMidpoint = favor - DEFAULT_IMPERIAL_FAVOR;
        const demandFactor = 1 + (DEFAULT_IMPERIAL_FAVOR - favor) * 0.04;
        const timeFactor = 1 + (deltaFromMidpoint * 0.04);
        return { demandFactor, timeFactor };
    }

    function scaleResourceDemand(amount, demandFactor, floor = 1) {
        const numericAmount = Number.isFinite(amount) ? amount : 0;
        return Math.max(floor, Math.round(numericAmount * demandFactor));
    }

    /**
     * Build a per-mandate resource checklist for UI overlays or confirmations.
     * @param {{ definition: object, runtime: object }} entry mandate entry to inspect.
     * @param {object|null} gameState latest known game state reference.
     * @returns {Array<{ key: string, label: string, current: number, target: number, unit: string }>}
     */
    function buildMandateResourceChecklist(entry, gameState) {
        if (!entry) return [];
        const safeGameState = gameState || state.lastGameState || {};
        const favor = clampImperialFavor(safeGameState.imperialFavor);
        const gold = Math.max(0, safeGameState.gold || 0);
        const wood = Math.max(0, safeGameState.wood || 0);

        switch (entry.definition.id) {
            case 'levy_tithed_gold': {
                const target = Number(entry.runtime.metadata.requiredGold) || 0;
                if (target <= 0) return [];
                return [{ key: 'gold', label: 'Coins', current: gold, target, unit: 'coins' }];
            }
            case 'infrastructure_quota': {
                const targetWood = Number(entry.runtime.metadata.targetWood) || 0;
                const targetGold = Number(entry.runtime.metadata.targetGold) || 0;
                const requirements = [];
                if (targetWood > 0) requirements.push({
                    key: 'wood',
                    label: 'Wood',
                    current: wood,
                    target: targetWood,
                    unit: 'wood'
                });
                if (targetGold > 0) requirements.push({
                    key: 'gold',
                    label: 'Coins',
                    current: gold,
                    target: targetGold,
                    unit: 'coins'
                });
                return requirements;
            }
            case 'rotating_resource_levy': {
                const target = Number(entry.runtime.metadata.requiredAmount) || 0;
                const resourceType = entry.runtime.metadata.resourceType || 'gold';
                if (target <= 0) return [];
                const current = resourceType === 'wood' ? wood : gold;
                return [{
                    key: resourceType,
                    label: resourceType === 'wood' ? 'Wood' : 'Coins',
                    current,
                    target,
                    unit: resourceType === 'wood' ? 'wood' : 'coins'
                }];
            }
            case 'diplomatic_envoys': {
                const giftCost = Number(entry.runtime.metadata.giftCost) || 0;
                const targetFavor = Number(entry.runtime.metadata.targetFavor) || 0;
                const requirements = [];
                if (giftCost > 0) requirements.push({
                    key: 'gold',
                    label: 'Coins',
                    current: gold,
                    target: giftCost,
                    unit: 'coins'
                });
                if (targetFavor > 0) requirements.push({
                    key: 'favor',
                    label: 'Imperial Favor',
                    current: favor,
                    target: targetFavor,
                    unit: 'favor'
                });
                return requirements;
            }
            default:
                return [];
        }
    }

    /**
     * Check whether a mandate's resource checklist is fully satisfied.
     * @param {{ definition: object, runtime: object }} entry active mandate entry.
     * @param {object|null} gameState latest known game state reference.
     * @returns {{ ready: boolean, requirements: Array<object> }}
     */
    function getMandateResourceStatus(entry, gameState) {
        const requirements = buildMandateResourceChecklist(entry, gameState);
        if (!requirements.length) return { ready: false, requirements };
        const ready = requirements.every((resource) => resource.current >= resource.target);
        return { ready, requirements };
    }

    /**
     * Prevent decree presenters from invoking overlap-prone combat cues so messaging remains UI-only.
     * @param {object} [uiBindings] hooks that may include a playSound delegate.
     * @returns {object} shallow copy with guarded audio hooks.
     */
    function sanitizeUIBindings(uiBindings = {}) {
        return uiAdapter.sanitizeUIBindings(uiBindings);
    }

    /**
     * Apply an imperial favor delta and refresh the HUD when bindings are provided.
     * @param {object} gameState live game reference holding the favor meter.
     * @param {object} uiBindings optional UI hooks that expose updateHUD.
     * @param {number} delta change to apply (positive for rewards, negative for reprimands).
     * @returns {number|null} updated favor value or null when game state is missing.
     */
    function applyImperialFavorDelta(gameState, uiBindings, delta = 0) {
        const targetGameState = gameState || state.lastGameState;
        if (!targetGameState) return null;
        const numericDelta = Number.isFinite(delta) ? delta : Number(delta);
        const safeDelta = Number.isFinite(numericDelta) ? numericDelta : 0;
        const current = Number.isFinite(targetGameState.imperialFavor)
            ? targetGameState.imperialFavor
            : DEFAULT_IMPERIAL_FAVOR;
        const next = clampImperialFavor(current + safeDelta);
        targetGameState.imperialFavor = next;
        if (typeof uiBindings?.updateHUD === 'function') uiBindings.updateHUD(targetGameState);
        return next;
    }

    const {
        convertToTicks = () => 0,
        formatCalendarLabel = () => 'M: Jan Y1 | W: 1/4 | D: 1/28',
        describeDeadlineTick: describeDeadlineTickWithCurrent,
        getMinimumMandateSpacing: calendarMinimumMandateSpacing,
        getEarliestIssueTick: calendarEarliestIssueTick
    } = MandateCalendar || {};

    /**
     * Convert an absolute mandate deadline into human-readable calendar text and
     * a remaining-day delta for UI overlays while staying decoupled from the state machine.
     * @param {number|null|undefined} deadlineTick tick on which the mandate expires.
     * @param {object} [gameState] optional live game reference for time config.
     * @returns {{ label: string, remainingDays: number|null }}
     */
    function describeDeadlineTick(deadlineTick, gameState) {
        if (typeof describeDeadlineTickWithCurrent === 'function') {
            return describeDeadlineTickWithCurrent(deadlineTick, state.currentTick, gameState || state.lastGameState);
        }
        if (!Number.isFinite(deadlineTick)) {
            return { label: 'No fixed deadline', remainingDays: null };
        }
        const normalizedTick = Math.max(0, deadlineTick);
        const label = formatCalendarLabel(Math.max(0, normalizedTick - 1), gameState || state.lastGameState);
        return { label, remainingDays: normalizedTick - state.currentTick };
    }

    function getMinimumMandateSpacing(gameState) {
        if (typeof calendarMinimumMandateSpacing === 'function') return calendarMinimumMandateSpacing(gameState);
        return convertToTicks({ weeks: 1, days: 2 }, gameState);
    }

    /**
     * Resolve the tutorial completion tick from the provided game state so
     * downstream pacing logic can avoid issuing mandates during onboarding.
     * @param {object} gameState live game reference that may expose tutorial state.
     * @returns {number|null} completion tick when known; null otherwise.
     */
    function getTutorialCompletionTick(gameState) {
        const tutorial = gameState?.tutorial;
        if (Number.isFinite(tutorial?.completionTick)) return tutorial.completionTick;
        if (Number.isFinite(tutorial?.completedTick)) return tutorial.completedTick;
        return null;
    }

    /**
     * Count player investment into upgrades beyond their baseline starting levels.
     * The levy uses this to gauge economic maturity rather than raw gold reserves.
     * @param {object} gameState live game reference exposing an upgrades hash.
     * @returns {number} total upgrade levels purchased above baseline.
     */
    function getUpgradeProgress(gameState) {
        if (!gameState?.upgrades || typeof gameState.upgrades !== 'object') return 0;
        return Object.values(gameState.upgrades)
            .map((level) => (Number.isFinite(level) ? Math.max(0, level - 1) : 0))
            .reduce((sum, delta) => sum + delta, 0);
    }

    /**
     * Count developed holdings (towns, castles, mines) to avoid taxing the player
     * before they meaningfully expand beyond starter fields.
     * @param {object} gameState live game reference exposing overworld tiles.
     * @returns {number} number of developed tiles under player control.
     */
    function getDevelopedHoldingCount(gameState) {
        if (!gameState?.overworld?.hexes) return 0;
        let developed = 0;
        gameState.overworld.hexes.forEach((tile) => {
            const type = (tile?.type || '').toLowerCase();
            const owner = (tile?.owner || 'player').toLowerCase();
            const isRebelCamp = RebelSystem?.isRebelCampTile?.(tile)
                || tile?.type === 'rebelcamp'
                || tile?.isRebelCamp;
            const isHostile = owner === 'scorched' || isRebelCamp;
            const isDeveloped = ['town', 'castle', 'mine', 'harbor', 'village'].includes(type);
            if (!isHostile && isDeveloped) developed += 1;
        });
        return developed;
    }

    /**
     * Coarse estimate of steady gold income based on developed holdings and
     * upgrade investments. Avoids pulling in the full overworld income logic
     * while still scaling levy size with economic strength.
     * @param {object} gameState live game reference exposing overworld tiles.
     * @returns {number} estimated gold income per tick.
     */
    function estimateGoldIncome(gameState) {
        if (!gameState?.overworld?.hexes) return 0;
        let income = 0;
        gameState.overworld.hexes.forEach((tile) => {
            const type = (tile?.type || '').toLowerCase();
            if (type === 'town' || type === 'castle') income += 3;
            else if (type === 'mine' || type === 'harbor' || type === 'village') income += 2;
        });
        return income + Math.floor(getUpgradeProgress(gameState) * 0.5);
    }

    /**
     * Calculate the levy demand using income and upgrades so unspent starting gold
     * does not inflate the required tithe.
     * @param {object} gameState live game reference exposing overworld and upgrades.
     * @returns {{ requiredGold: number, upgradeProgress: number, developedHoldings: number }}
     */
    function computeTaxLevyRequirement(gameState) {
        const upgradeProgress = getUpgradeProgress(gameState);
        const developedHoldings = getDevelopedHoldingCount(gameState);
        const income = estimateGoldIncome(gameState);
        const baseline = 125;
        const weighted = 80 + (upgradeProgress * 18) + (developedHoldings * 12) + (income * 8);
        const { demandFactor } = getFavorPacingAdjustments(gameState);
        const requiredGold = Math.max(baseline, Math.floor(weighted * demandFactor));
        return { requiredGold, upgradeProgress, developedHoldings };
    }

    const MIN_LEVY_UPGRADE_PROGRESS = 2;
    const MIN_LEVY_DEVELOPED_HOLDINGS = 2;

    /**
     * Enforce a lengthy grace window for the levy that respects tutorial
     * completion so the opening minutes remain tax-free.
     * @param {number} baseEarliestTick earliest tick derived from the mandate config.
     * @param {object} gameState live game reference for cadence and tutorial state.
     * @returns {number} resolved earliest issuance tick.
     */
    function resolveTaxLevyEarliestTick(baseEarliestTick, gameState) {
        const graceTick = convertToTicks({ weeks: 2, days: 2 }, gameState);
        const tutorialCompletionTick = getTutorialCompletionTick(gameState);
        const tutorialBuffer = Number.isFinite(tutorialCompletionTick)
            ? tutorialCompletionTick + convertToTicks({ days: 3 }, gameState)
            : 0;
        return Math.max(baseEarliestTick, graceTick, tutorialBuffer);
    }

    function getDurationTicks(entry, ctx) {
        const { timeFactor } = getFavorPacingAdjustments(ctx.gameState);
        if (entry.definition.duration) {
            const base = convertToTicks(entry.definition.duration, ctx.gameState);
            return entry.definition.scaleDurationWithFavor ? Math.max(1, Math.round(base * timeFactor)) : base;
        }
        if (entry.definition.durationTicks) {
            const baseDuration = entry.definition.durationTicks;
            return entry.definition.scaleDurationWithFavor ? Math.max(1, Math.round(baseDuration * timeFactor)) : baseDuration;
        }
        return null;
    }

    function getEarliestIssueTick(entry, gameState) {
        const baseEarliestTick = typeof calendarEarliestIssueTick === 'function'
            ? calendarEarliestIssueTick(entry, gameState)
            : (entry?.definition?.earliestIssue ? convertToTicks(entry.definition.earliestIssue, gameState) : 0);

        const frontierSweepResolved = Number.isFinite(state.rebelSweep?.completionTick);
        const gateAfterFrontierSweep = (offsetTick = 0) => {
            if (!frontierSweepResolved) return Number.POSITIVE_INFINITY;
            return state.rebelSweep.completionTick + Math.max(0, offsetTick);
        };

        if (entry?.definition?.id === 'push_the_frontier') {
            if (!frontierSweepResolved) return Number.POSITIVE_INFINITY;
            return gateAfterFrontierSweep(baseEarliestTick);
        }

        if (entry?.definition?.id === 'levy_tithed_gold') {
            const levyWindow = resolveTaxLevyEarliestTick(baseEarliestTick, gameState);
            return gateAfterFrontierSweep(levyWindow);
        }

        const gatedMandates = new Set([
            'infrastructure_quota',
            'rotating_resource_levy',
            'diplomatic_envoys'
        ]);

        if (gatedMandates.has(entry?.definition?.id)) {
            return gateAfterFrontierSweep(baseEarliestTick);
        }

        return baseEarliestTick;
    }

    function isRecurringMandate(entry) {
        if (!entry || !entry.definition) return false;
        if (entry.definition.repeatable === false) return false;
        return entry.definition.id !== 'destroy_first_rebel_camp';
    }

    function getRecurrenceCooldown(entry, gameState) {
        const minimumSpacing = getMinimumMandateSpacing(gameState);
        const configuredCooldown = entry.definition.recurrenceCooldown
            ? convertToTicks(entry.definition.recurrenceCooldown, gameState)
            : 0;
        return Math.max(minimumSpacing, configuredCooldown);
    }

    function scheduleMandateRecurrence(entry, gameState) {
        if (!isRecurringMandate(entry)) return;
        const cooldown = getRecurrenceCooldown(entry, gameState);
        entry.runtime.cooldownUntilTick = state.currentTick + cooldown;
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

    function resolvePayloadTileKey(payload) {
        if (!payload) return null;
        return payload.targetTileKey || getTileKey(payload.targetTile || payload.tile);
    }

    function resolvePayloadTile(payload, gameState) {
        const payloadTile = payload?.targetTile || payload?.tile || null;
        const payloadKey = resolvePayloadTileKey(payload);
        const overworldTile = payloadKey ? gameState?.overworld?.hexes?.get?.(payloadKey) : null;
        return overworldTile || payloadTile;
    }

    function resetTrackedRebel(tile) {
        const entry = state.mandates.get('destroy_first_rebel_camp');
        if (!entry?.runtime?.metadata) return;

        const clearedKey = getTileKey(tile);
        if (!clearedKey || entry.runtime.metadata.targetTileKey === clearedKey) {
            entry.runtime.metadata.targetTileKey = null;
        }
    }

    function renderImperialModal(config) {
        return uiAdapter.renderImperialModal(config);
    }

    function showImperialMessage(config, uiBindings) {
        return uiAdapter.showImperialMessage(config, uiBindings);
    }

    function queueImperialNotification(lines, uiBindings, options = {}) {
        return uiAdapter.queueImperialNotification(lines, uiBindings, options);
    }

    function showMandateBanner(lines, uiBindings, title = 'By Imperial Decree:', durationOrOptions = 4200) {
        return uiAdapter.showMandateBanner(lines, uiBindings, title, durationOrOptions);
    }

    function showRebelDecreeCallout(rebelTile, gameState, uiBindings = {}, options = {}) {
        return uiAdapter.showRebelDecreeCallout(rebelTile, gameState, uiBindings, options);
    }

    function snapshotMandate(entry) {
        const { ready, requirements } = getMandateResourceStatus(entry, state.lastGameState);
        return {
            id: entry.definition.id,
            title: entry.definition.title,
            description: entry.definition.description,
            status: entry.runtime.status,
            deadlineTick: entry.runtime.deadlineTick,
            issuedTick: entry.runtime.issuedTick,
            completedTick: entry.runtime.completedTick,
            cooldownUntilTick: entry.runtime.cooldownUntilTick,
            metadata: { ...entry.runtime.metadata },
            resourceRequirements: requirements,
            resourceReady: ready,
            resourceConfirmed: Boolean(entry.runtime.metadata.confirmed)
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
            lastIssuedTick: state.lastIssuedTick,
            rebelSweep: { ...state.rebelSweep }
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
            entry.runtime.completedTick = Number.isFinite(runtime.completedTick) ? runtime.completedTick : null;
            entry.runtime.cooldownUntilTick = Number.isFinite(runtime.cooldownUntilTick)
                ? runtime.cooldownUntilTick
                : null;
            if (runtime.metadata && typeof runtime.metadata === 'object') {
                entry.runtime.metadata = { ...entry.runtime.metadata, ...runtime.metadata };
            }
        });
        if (gameState) state.lastGameState = gameState;
    }

    function buildContext(gameState, uiBindings, payload) {
        if (gameState) state.lastGameState = gameState;
        if (uiBindings) {
            state.lastUIBindings = { ...state.lastUIBindings, ...sanitizeUIBindings(uiBindings) };
        }
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
            completedTick: null,
            cooldownUntilTick: null,
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
        entry.runtime.completedTick = null;
        entry.runtime.cooldownUntilTick = null;
        entry.runtime.durationTicks = null;
        entry.runtime.metadata = typeof entry.definition.createInitialState === 'function'
            ? entry.definition.createInitialState()
            : {};
        entry.runtime.reprimandShown = false;
    }

    function recordRebelSweepOutcome(outcome) {
        state.rebelSweep = {
            outcome,
            completionTick: state.currentTick
        };
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
        state.rebelSweep = { outcome: null, completionTick: null };
        state.mandates.forEach(resetMandate);
    }

    function markSuccess(entry, ctx, payload) {
        entry.runtime.status = MandateStatus.SUCCEEDED;
        entry.runtime.completedTick = state.currentTick;
        const patchedCtx = { ...ctx, gameState: ctx.gameState || state.lastGameState };
        if (entry.definition.id === 'destroy_first_rebel_camp') {
            recordRebelSweepOutcome(MandateStatus.SUCCEEDED);
        }
        if (typeof entry.definition.onSuccess === 'function') {
            entry.definition.onSuccess({ ...patchedCtx, mandate: entry, payload });
        }
        applyImperialFavorDelta(patchedCtx.gameState, patchedCtx.uiBindings, entry.definition.successFavorDelta ?? 1);
        scheduleMandateRecurrence(entry, patchedCtx.gameState);
    }

    function markFailure(entry, ctx, payload) {
        entry.runtime.status = MandateStatus.FAILED;
        entry.runtime.completedTick = state.currentTick;
        const patchedCtx = { ...ctx, gameState: ctx.gameState || state.lastGameState };
        if (entry.definition.id === 'destroy_first_rebel_camp') {
            recordRebelSweepOutcome(MandateStatus.FAILED);
        }
        if (typeof entry.definition.onFailure === 'function') {
            entry.definition.onFailure({ ...patchedCtx, mandate: entry, payload });
        }
        applyImperialFavorDelta(patchedCtx.gameState, patchedCtx.uiBindings, entry.definition.failureFavorDelta ?? -1);
        scheduleMandateRecurrence(entry, patchedCtx.gameState);
    }

    /**
     * Reset completed mandates after their cooldowns elapse so recurring decrees can re-enter the queue.
     * Cycle-tracked mandates only reset once their runtime cycle lists have been exhausted.
     * @param {object} ctx shared context for cadence lookups.
     */
    function refreshRecurringMandates(ctx) {
        state.mandates.forEach((entry) => {
            if (entry.runtime.status === MandateStatus.ACTIVE) return;
            if (!isRecurringMandate(entry)) return;
            if (!Number.isFinite(entry.runtime.cooldownUntilTick)) return;
            const cycleList = entry.runtime.metadata?.cycleList;
            const cyclesExhausted = !Array.isArray(cycleList) || cycleList.length === 0;
            if (!cyclesExhausted) return;
            if (state.currentTick < entry.runtime.cooldownUntilTick) return;
            resetMandate(entry);
        });
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
        refreshRecurringMandates(ctx);
        issuePendingMandates(ctx.gameState, ctx.uiBindings);
    }

    /**
     * Confirm payment-ready mandates and immediately evaluate their success conditions.
     * @param {string} mandateId mandate identifier to confirm.
     * @param {object} [gameState] optional live game reference for resource checks.
     * @param {object} [uiBindings] optional UI hooks for messaging.
     * @returns {{ ok: boolean, reason?: string, requirements?: Array<object> }}
     */
    function confirmMandateResources(mandateId, gameState, uiBindings) {
        const entry = state.mandates.get(mandateId);
        if (!entry || entry.runtime.status !== MandateStatus.ACTIVE) {
            return { ok: false, reason: 'inactive' };
        }
        if (entry.runtime.metadata.confirmed) {
            return { ok: false, reason: 'already-confirmed' };
        }
        const ctx = buildContext(gameState, uiBindings);
        const { ready, requirements } = getMandateResourceStatus(entry, ctx.gameState);
        if (!requirements.length) {
            return { ok: false, reason: 'no-resources' };
        }
        if (!ready) {
            return { ok: false, reason: 'insufficient-resources', requirements };
        }
        entry.runtime.metadata.confirmed = true;
        recordEvent('mandate_confirmed', { mandateId, requirements }, ctx.gameState, ctx.uiBindings);
        return { ok: true, requirements };
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
        const targetTileKey = getTileKey(targetTile);
        recordEvent('battle_outcome', { result, targetTile, targetTileKey }, gameState, uiBindings);
    }

    /**
     * Forward tile clear events to mandate predicates without duplicating logic.
     * @param {object} tile cleared tile payload.
     * @param {object} gameState live game state reference.
     * @param {object} [uiBindings] optional UI hooks for decree rendering.
     * @param {string|null} [explicitTileKey] stable tile key to use when the tile reference may change.
     */
    function handleTileCleared(tile, gameState, uiBindings = {}, explicitTileKey = null) {
        const targetTileKey = explicitTileKey || getTileKey(tile);
        recordEvent('tile_cleared', { tile, targetTileKey }, gameState, uiBindings);
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
            lastIssuedTick: state.lastIssuedTick,
            rebelSweep: { ...state.rebelSweep }
        };
    }

    // --- Mandate definitions ---
    function buildRebelMandate() {
        const blueprint = getMandateBlueprint('destroy_first_rebel_camp') || {};
        return {
            ...blueprint,
            id: 'destroy_first_rebel_camp',
            title: blueprint.title || 'Frontier Sweep',
            description: blueprint.description || 'Destroy the first rebel encampment seeded near the foggy frontier before the Emperor loses patience.',
            duration: blueprint.duration || { weeks: 3 },
            createInitialState: () => ({ targetTileKey: null, preferAnchoredDecree: true, deadlineWarned: false }),
            triggerPredicate: ({ gameState }) => Boolean(gameState?.overworld?.hexes?.size),
            onIssue: ({ gameState, uiBindings, mandate }) => {
                const rebelTile = RebelSystem.spawnRebelCampNearFrontier?.(gameState, { enemyLevel: 1 });
                if (!rebelTile) {
                    console.warn('Imperial mandate could not place a rebel camp.');
                    return;
                }

                mandate.runtime.metadata.targetTileKey = getTileKey(rebelTile);
                const body = DEFAULT_REBEL_DECREE_LINES.join('\n');
                const shouldAnchorToTile = mandate.runtime.metadata.preferAnchoredDecree
                    && typeof (uiBindings.showTileCallout || TutorialCallouts?.showTileCallout) === 'function';
                mandate.runtime.metadata.preferAnchoredDecree = false;

                const anchored = shouldAnchorToTile && showRebelDecreeCallout(rebelTile, gameState, uiBindings, {
                    body: body.replace(/\n/g, '<br>'),
                    title: 'By Imperial Decree:'
                });

                if (!anchored) {
                    showMandateBanner(body.split('\n'), uiBindings, 'By Imperial Decree:');
                }
            },
            onEvent: (eventType, payload, ctx) => {
                const targetKey = ctx.mandate.runtime.metadata.targetTileKey;
                const trackedKey = resolvePayloadTileKey(payload);
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
                const trackedKey = resolvePayloadTileKey(payload);
                if (!trackedKey || trackedKey !== targetKey) return false;

                if (eventType === 'battle_outcome') {
                    const result = (payload?.result || '').toUpperCase();
                    return result === 'VICTORY';
                }
                if (eventType === 'tile_cleared') return true;
                return false;
            },
            onSuccess: ({ payload, gameState, uiBindings }) => {
                const tile = resolvePayloadTile(payload, gameState);
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
        const blueprint = getMandateBlueprint('levy_tithed_gold') || {};
        return {
            ...blueprint,
            id: 'levy_tithed_gold',
            title: blueprint.title || 'Imperial Tax Levy',
            description: blueprint.description || 'Deliver a gold tithe to the capital. Maintain reserves long enough for the courier to collect payment.',
            duration: blueprint.duration || { weeks: 1, days: 4 },
            scaleDurationWithFavor: true,
            createInitialState: () => ({ requiredGold: 0, deadlineWarned: false, confirmed: false }),
            earliestIssue: blueprint.earliestIssue || { weeks: 2, days: 2 },
            triggerPredicate: ({ gameState }) => {
                const { requiredGold, upgradeProgress, developedHoldings } = computeTaxLevyRequirement(gameState);
                const meetsProgressThreshold = upgradeProgress >= MIN_LEVY_UPGRADE_PROGRESS
                    || developedHoldings >= MIN_LEVY_DEVELOPED_HOLDINGS;
                if (!meetsProgressThreshold) return false;
                return (gameState?.gold || 0) >= requiredGold;
            },
            onIssue: ({ gameState, uiBindings, mandate }) => {
                const { requiredGold } = computeTaxLevyRequirement(gameState);
                mandate.runtime.metadata.requiredGold = requiredGold;
                showMandateBanner([
                    `Levy announced: remit ${requiredGold} gold.`,
                    `Collectors arrive by ${formatCalendarLabel((mandate.runtime.deadlineTick || state.currentTick) - 1, gameState)}.`
                ], uiBindings, 'Imperial Tax Levy');
            },
            successPredicate: (eventType, payload, ctx) => (
                eventType === 'mandate_confirmed'
                && payload?.mandateId === ctx.mandate.definition.id
                && ctx.mandate.runtime.metadata.confirmed
            ),
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
        const blueprint = getMandateBlueprint('push_the_frontier') || {};
        return {
            ...blueprint,
            id: 'push_the_frontier',
            title: blueprint.title || 'Push the Frontier',
            description: blueprint.description || 'Claim additional territory before the frontier stagnates. Expansion proves loyalty.',
            duration: blueprint.duration || { weeks: 2, days: 3 },
            createInitialState: () => ({ startingTerritory: 0, targetTerritory: 0, deadlineWarned: false }),
            earliestIssue: blueprint.earliestIssue || { weeks: 2, days: 4 },
            triggerPredicate: ({ gameState }) => Boolean(state.rebelSweep?.outcome)
                && (gameState?.overworld?.hexes?.size || 0) >= 4,
            onIssue: ({ gameState, uiBindings, mandate }) => {
                const currentTerritory = gameState?.overworld?.hexes?.size || 0;
                mandate.runtime.metadata.startingTerritory = currentTerritory;
                mandate.runtime.metadata.targetTerritory = currentTerritory + 3;
                showMandateBanner([
                    `Add ${mandate.runtime.metadata.targetTerritory - currentTerritory} holdings before the fog closes in.`,
                    'New towns will earn a small signing bonus.',
                    'Unlocked once the frontier sweep decree resolves.'
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

    /**
     * Infrastructure stockpile quota that pressures the player to bank materials for public works.
     * Rewards a logistics stipend when enough resources are staged before the inspectors arrive.
     */
    function buildInfrastructureQuotaMandate() {
        const blueprint = getMandateBlueprint('infrastructure_quota') || {};
        const describeStockpileLine = (current, target) => {
            if (current >= target) return `ready (${current}/${target})`;
            return `short by ${target - current} (${current}/${target})`;
        };

        /**
         * Present an interactive modal so players can consciously remit staged materials.
         * Ensures resources are only withdrawn once the acceptance action fires.
         * @param {{ gameState: object, uiBindings: object, mandate: object }} ctx active mandate context.
         */
        const showInfrastructureQuotaModal = (ctx) => {
            const { gameState, uiBindings, mandate } = ctx;
            const { targetWood, targetGold } = mandate.runtime.metadata;
            const wood = Math.max(0, gameState?.wood || 0);
            const gold = Math.max(0, gameState?.gold || 0);
            const meetsWood = wood >= targetWood;
            const meetsGold = gold >= targetGold;
            const ready = meetsWood && meetsGold;
            const statusLine = `Current stores: ${wood} wood (${describeStockpileLine(wood, targetWood)}), ${gold} gold (${describeStockpileLine(gold, targetGold)})`;
            const instructions = ready
                ? 'Depots are stocked. Accept to remit materials and clear the inspection.'
                : 'Keep stockpiling before accepting the inspection.';

            showImperialMessage({
                title: 'Infrastructure Quota',
                lines: [
                    `Stage ${targetWood} wood and ${targetGold} gold for the engineers.`,
                    statusLine,
                    instructions
                ],
                buttonLabel: 'Accept',
                onConfirm: () => {
                    if (!ready) {
                        showMandateBanner('Depots are not fully stocked yet.', uiBindings, 'Infrastructure Quota', { tone: 'warning', duration: 3600 });
                        return;
                    }
                    confirmMandateResources(mandate.definition.id, gameState, uiBindings);
                }
            }, uiBindings);
        };

        return {
            ...blueprint,
            id: 'infrastructure_quota',
            title: blueprint.title || 'Infrastructure Quota',
            description: blueprint.description || 'Stage materials for imperial engineers so roads, depots, and waystations can be laid without delay.',
            duration: blueprint.duration || { weeks: 1, days: 1 },
            scaleDurationWithFavor: true,
            createInitialState: () => ({ targetWood: 0, targetGold: 0, deadlineWarned: false, confirmed: false, readyPrompted: false }),
            earliestIssue: blueprint.earliestIssue || { weeks: 2, days: 3 },
            triggerPredicate: ({ gameState }) => (gameState?.wood || 0) >= 80 && (gameState?.gold || 0) >= 70,
            onIssue: ({ gameState, uiBindings, mandate }) => {
                const { demandFactor } = getFavorPacingAdjustments(gameState);
                const baselineWood = Math.max(0, gameState?.wood || 0);
                const baselineGold = Math.max(0, gameState?.gold || 0);
                mandate.runtime.metadata.targetWood = scaleResourceDemand(baselineWood + 60, demandFactor, 40);
                mandate.runtime.metadata.targetGold = scaleResourceDemand(baselineGold + 45, demandFactor, 30);
                const deadlineLabel = formatCalendarLabel((mandate.runtime.deadlineTick || state.currentTick) - 1, gameState);
                showMandateBanner([
                    `Stage ${mandate.runtime.metadata.targetWood} wood and ${mandate.runtime.metadata.targetGold} gold.`,
                    `Inspectors arrive by ${deadlineLabel}.`
                ], uiBindings, 'Infrastructure Quota');
                showInfrastructureQuotaModal({ gameState, uiBindings, mandate });
            },
            onEvent: (eventType, payload, ctx) => {
                if (ctx.mandate.runtime.metadata.confirmed) return;
                const isResourceEvent = eventType === 'tick' || eventType === 'inventory_change';
                if (!isResourceEvent) return;
                const wood = ctx.gameState?.wood || 0;
                const gold = ctx.gameState?.gold || 0;
                const { targetWood, targetGold, readyPrompted } = ctx.mandate.runtime.metadata;
                if (wood >= targetWood && gold >= targetGold && !readyPrompted) {
                    ctx.mandate.runtime.metadata.readyPrompted = true;
                    showInfrastructureQuotaModal(ctx);
                }
            },
            successPredicate: (eventType, payload, ctx) => (
                eventType === 'mandate_confirmed'
                && payload?.mandateId === ctx.mandate.definition.id
                && ctx.mandate.runtime.metadata.confirmed
            ),
            onSuccess: ({ gameState, uiBindings, mandate }) => {
                const { targetGold = 0, targetWood = 0 } = mandate.runtime.metadata;
                if (typeof gameState?.gold === 'number') {
                    gameState.gold = Math.max(0, gameState.gold - targetGold);
                    gameState.gold += 50;
                }
                if (typeof gameState?.wood === 'number') {
                    gameState.wood = Math.max(0, gameState.wood - targetWood);
                    gameState.wood += 30;
                }
                showMandateBanner([
                    'Materials staged. Imperial engineers send a logistics stipend.',
                    'Supplies secured: +50 gold, +30 wood.'
                ], uiBindings, 'Quota Cleared', { tone: 'success' });
            },
            failurePredicate: (eventType, payload, ctx) => {
                if (eventType !== 'tick') return false;
                return ctx.mandate.runtime.deadlineTick && state.currentTick >= ctx.mandate.runtime.deadlineTick;
            },
            onFailure: ({ gameState, uiBindings, mandate }) => {
                if (typeof gameState?.wood === 'number') {
                    gameState.wood = Math.max(0, gameState.wood - 35);
                }
                if (typeof gameState?.gold === 'number') {
                    const seizeAmount = Math.floor((mandate.runtime.metadata.targetGold || 30) * 0.25);
                    gameState.gold = Math.max(0, gameState.gold - seizeAmount);
                }
                showMandateBanner([
                    'Inspectors found empty depots. Materials have been requisitioned elsewhere.',
                    'Future quotas will draw heavier scrutiny.'
                ], uiBindings, 'Quota Missed', { tone: 'warning' });
            },
            successFavorDelta: blueprint.successFavorDelta ?? 2,
            failureFavorDelta: blueprint.failureFavorDelta ?? -2
        };
    }

    /**
     * Rotating levy that alternates between gold and wood to keep frontier holdings paying into the capital.
     * Each cycle demands a heavy portion of the chosen reserve but returns a modest rebate when satisfied early.
     */
    function buildRotatingLevyMandate() {
        const blueprint = getMandateBlueprint('rotating_resource_levy') || {};
        return {
            ...blueprint,
            id: 'rotating_resource_levy',
            title: blueprint.title || 'Rotating Imperial Levy',
            description: blueprint.description || 'Alternate between gold and timber tributes so the treasury stays balanced and the navy stays supplied.',
            duration: blueprint.duration || { weeks: 1, days: 4 },
            scaleDurationWithFavor: true,
            createInitialState: () => ({ requiredAmount: 0, resourceType: 'gold', deadlineWarned: false, confirmed: false }),
            earliestIssue: blueprint.earliestIssue || { weeks: 3 },
            triggerPredicate: ({ gameState }) => {
                const holdings = gameState?.overworld?.hexes?.size || 0;
                const strongestReserve = Math.max(gameState?.gold || 0, gameState?.wood || 0);
                return holdings >= 6 && strongestReserve >= 120;
            },
            onIssue: ({ gameState, uiBindings, mandate }) => {
                const resourceType = state.currentTick % 2 === 0 ? 'gold' : 'wood';
                const reserve = Math.max(0, gameState?.[resourceType] || 0);
                const { demandFactor } = getFavorPacingAdjustments(gameState);
                const requiredAmount = scaleResourceDemand(Math.max(70, Math.floor(reserve * 0.5)), demandFactor, 50);
                mandate.runtime.metadata.resourceType = resourceType;
                mandate.runtime.metadata.requiredAmount = requiredAmount;
                const deadlineLabel = formatCalendarLabel((mandate.runtime.deadlineTick || state.currentTick) - 1, gameState);
                showMandateBanner([
                    `Deliver ${requiredAmount} ${resourceType} by ${deadlineLabel}.`,
                    'Rotation shifts the next levy to the opposite reserve.'
                ], uiBindings, 'Rotating Imperial Levy');
            },
            successPredicate: (eventType, payload, ctx) => (
                eventType === 'mandate_confirmed'
                && payload?.mandateId === ctx.mandate.definition.id
                && ctx.mandate.runtime.metadata.confirmed
            ),
            onSuccess: ({ gameState, uiBindings, mandate }) => {
                const { resourceType, requiredAmount } = mandate.runtime.metadata;
                if (typeof gameState?.[resourceType] === 'number') {
                    gameState[resourceType] = Math.max(0, gameState[resourceType] - requiredAmount);
                    gameState[resourceType] += Math.floor(requiredAmount * 0.35);
                }
                showMandateBanner([
                    'Levy escorted to the capital. A rebate returns with the treasury seal.',
                    `Refund received: +35% ${resourceType}.`
                ], uiBindings, 'Levy Fulfilled', { tone: 'success' });
            },
            failurePredicate: (eventType, payload, ctx) => {
                if (eventType !== 'tick') return false;
                return ctx.mandate.runtime.deadlineTick && state.currentTick >= ctx.mandate.runtime.deadlineTick;
            },
            onFailure: ({ gameState, uiBindings, mandate }) => {
                const { resourceType, requiredAmount } = mandate.runtime.metadata;
                if (typeof gameState?.[resourceType] === 'number') {
                    const penalty = Math.max(30, Math.floor(requiredAmount * 0.25));
                    gameState[resourceType] = Math.max(0, gameState[resourceType] - penalty);
                }
                showMandateBanner([
                    'Levy caravans never departed. Imperial auditors seize stores on-site.',
                    'Local governors warned: rotation penalties will compound.'
                ], uiBindings, 'Levy Defaulted', { tone: 'warning' });
            },
            successFavorDelta: blueprint.successFavorDelta ?? 1,
            failureFavorDelta: blueprint.failureFavorDelta ?? -2
        };
    }

    /**
     * Diplomacy-driven task that leverages imperial favor to smooth frontier relations.
     * Requires gifts and goodwill within a strict window, rewarding additional favor on success.
     */
    function buildDiplomaticMandate() {
        const blueprint = getMandateBlueprint('diplomatic_envoys') || {};
        return {
            ...blueprint,
            id: 'diplomatic_envoys',
            title: blueprint.title || 'Dispatch Diplomatic Envoys',
            description: blueprint.description || 'Maintain favor and pay coin to keep frontier courts aligned with the Empire.',
            duration: blueprint.duration || { weeks: 1 },
            createInitialState: () => ({ targetFavor: 0, giftCost: 0, deadlineWarned: false, confirmed: false }),
            earliestIssue: blueprint.earliestIssue || { weeks: 2, days: 2 },
            triggerPredicate: ({ gameState }) => {
                const favor = clampImperialFavor(gameState?.imperialFavor);
                return favor >= 6 && (gameState?.gold || 0) >= 60;
            },
            onIssue: ({ gameState, uiBindings, mandate }) => {
                const currentFavor = clampImperialFavor(gameState?.imperialFavor);
                const targetFavor = Math.min(10, currentFavor + 2);
                const giftCost = Math.max(45, Math.floor((gameState?.gold || 0) * 0.25));
                mandate.runtime.metadata.targetFavor = targetFavor;
                mandate.runtime.metadata.giftCost = giftCost;
                const deadlineLabel = formatCalendarLabel((mandate.runtime.deadlineTick || state.currentTick) - 1, gameState);
                showMandateBanner([
                    `Prepare envoys with ${giftCost} gold in gifts.`,
                    `Secure favor ${targetFavor}+ by ${deadlineLabel}.`
                ], uiBindings, 'Diplomatic Envoys');
            },
            successPredicate: (eventType, payload, ctx) => (
                eventType === 'mandate_confirmed'
                && payload?.mandateId === ctx.mandate.definition.id
                && ctx.mandate.runtime.metadata.confirmed
            ),
            onSuccess: ({ gameState, uiBindings, mandate }) => {
                const { giftCost } = mandate.runtime.metadata;
                if (typeof gameState?.gold === 'number') {
                    gameState.gold = Math.max(0, gameState.gold - giftCost);
                }
                if (typeof gameState?.wood === 'number') gameState.wood += 25;
                showMandateBanner([
                    'Envoys return with new pacts and trade scripts.',
                    'Tributaries send timber in gratitude: +25 wood.'
                ], uiBindings, 'Diplomatic Success', { tone: 'success' });
            },
            failurePredicate: (eventType, payload, ctx) => {
                if (eventType !== 'tick') return false;
                return ctx.mandate.runtime.deadlineTick && state.currentTick >= ctx.mandate.runtime.deadlineTick;
            },
            onFailure: ({ gameState, uiBindings }) => {
                if (typeof gameState?.gold === 'number') {
                    gameState.gold = Math.max(0, gameState.gold - 30);
                }
                showMandateBanner([
                    'Envoys stalled and were snubbed by local courts.',
                    'Imperial patience thins; reparations paid from your treasury.'
                ], uiBindings, 'Diplomatic Failure', { tone: 'warning' });
            },
            successFavorDelta: blueprint.successFavorDelta ?? 2,
            failureFavorDelta: blueprint.failureFavorDelta ?? -3
        };
    }

    registerMandate(buildRebelMandate());
    registerMandate(buildTaxLevyMandate());
    registerMandate(buildExpansionMandate());
    registerMandate(buildInfrastructureQuotaMandate());
    registerMandate(buildRotatingLevyMandate());
    registerMandate(buildDiplomaticMandate());

    const api = {
        MandateStatus,
        registerMandate,
        issuePendingMandates,
        recordEvent,
        confirmMandateResources,
        getActiveMandates,
        describeDeadlineTick,
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

    return api;
}

/**
 * Register the core mandate factory on the provided global scope.
 * @param {Window|Object} [target] global object to attach createImperialMandates to.
 * @returns {{ createImperialMandates: Function }} core mandate factory handle.
 */
function initImperialMandatesCore(target = typeof window !== 'undefined' ? window : globalThis) {
    if (target) {
        target.createImperialMandates = createImperialMandates;
    }
    return { createImperialMandates };
}

createImperialMandates.initImperialMandatesCore = initImperialMandatesCore;
export { initImperialMandatesCore };
export default createImperialMandates;

if (typeof module !== 'undefined') {
    module.exports = createImperialMandates;
}
