/**
 * King controller for imperial mandates.
 * Coordinates the lifecycle for the first rebel order (destroy_first_rebel_camp),
 * orchestrating issuance, reprimands, and completion messaging through the UI layer.
 * Public API: issueInitialMandate, handleBattleOutcome, resetForNewCampaign, getKingState.
 */
(function (global) {
    const RebelSystem = (global.RebelSystem)
        || (typeof require === 'function' ? require('./rebelSystem.js') : {});
    const TutorialCallouts = (global.TutorialCallouts)
        || (typeof require === 'function' ? require('./tutorialCallouts.js') : null);

    /**
     * Enumerated lifecycle states for mandates governed by the King.
     * The flow currently only uses NOT_ISSUED → ACTIVE → COMPLETED for the rebel order,
     * but FAILED is reserved for future mandates.
     */
    const MandateStatus = {
        NOT_ISSUED: 'NOT_ISSUED',
        ACTIVE: 'ACTIVE',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED'
    };

    const kingState = {
        firstRebelMandate: {
            id: 'destroy_first_rebel_camp',
            status: MandateStatus.NOT_ISSUED,
            targetTileKey: null,
            reprimandShown: false
        }
    };

    let preferAnchoredDecree = true;
    let initialMandatePending = false;

    function getTileKey(tile) {
        if (!tile) return null;
        if (typeof tile === 'string') return tile;
        if (tile.hex && typeof tile.hex.toString === 'function') return tile.hex.toString();
        if (typeof tile.toString === 'function') return tile.toString();
        return null;
    }

    function resetTrackedRebel(tile, gameState) {
        if (!tile) return;
        tile.isRebelCamp = false;
        if (tile.type === 'rebelcamp') {
            tile.type = tile.prevType || 'field';
        }
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

    /**
     * Show a floating imperial decree using the standard renderer (no button, auto-dismiss).
     * Falls back to a randomized imperial notice if no specific lines are provided.
     * @param {string[]} [lines] decree body lines.
     * @param {object} [uiBindings] optional UI helper overrides.
     * @param {object} [options] optional renderer controls.
     * @param {number} [options.duration] auto-dismiss override in milliseconds.
     * @param {string} [options.title] override for the decree title.
     */
    function showStandardImperialDecree(lines, uiBindings, { duration, title = 'By Imperial Decree:' } = {}) {
        showImperialMessage({
            title,
            lines: getImperialDecreeLines(lines),
            buttonLabel: null,
            duration
        }, uiBindings);
    }

    /**
     * Render an anchored callout pointing to the rebel camp tile.
     * Compatible with both game-bound and raw helper signatures from the tutorial system.
     * @param {object} rebelTile tile to anchor the callout.
     * @param {object} gameState live game state for helper signatures.
     * @param {object} uiBindings optional UI helpers.
     * @param {object} [options] renderer controls such as autoHide.
     */
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

    function consumeAnchoredDecree() {
        preferAnchoredDecree = false;
    }

    function presentInitialDecree(rebelTile, gameState, uiBindings, calloutOptions) {
        if (preferAnchoredDecree && rebelTile) {
            showRebelDecreeCallout(rebelTile, gameState, uiBindings, calloutOptions);
            consumeAnchoredDecree();
            return;
        }

        consumeAnchoredDecree();
        showStandardImperialDecree(null, uiBindings);
    }

    function issueFirstRebelMandate(gameState, uiBindings) {
        initialMandatePending = false;
        if (kingState.firstRebelMandate.status !== MandateStatus.NOT_ISSUED
            || kingState.firstRebelMandate.targetTileKey) return;

        const rebelTile = RebelSystem.spawnRebelCampNearFrontier?.(gameState, { enemyLevel: 1 });
        if (!rebelTile) {
            console.warn('Imperial mandate could not place a rebel camp.');
            return;
        }

        kingState.firstRebelMandate.targetTileKey = getTileKey(rebelTile);
        kingState.firstRebelMandate.status = MandateStatus.ACTIVE;
        kingState.firstRebelMandate.reprimandShown = false;

        const body = 'Patrol the frontier.\nRebels have been sighted nearby.\nExpand the Empire\'s reach — and survive the rebels beyond the fog.';
        presentInitialDecree(rebelTile, gameState, uiBindings, {
            body: body.replace(/\n/g, '<br>'),
            title: 'By Imperial Decree:'
        });
        if (typeof gameState?.playSound === 'function') gameState.playSound('wardrum', { allowOverlap: true });
    }

    /**
     * Public entry point for the opening mandate. Designed to be triggered once per
     * fresh campaign after the player presses BEGIN.
     * @param {object} gameState live game state.
     * @param {object} [uiBindings] optional UI helpers for modal rendering.
     */
    function issueInitialMandate(gameState, uiBindings = {}) {
        if (!initialMandatePending && kingState.firstRebelMandate.status === MandateStatus.NOT_ISSUED) return;
        issueFirstRebelMandate(gameState, uiBindings);
    }

    /**
     * Respond to the conclusion of a battle so the King can react to victory/defeat
     * against the tracked rebel camp.
     * @param {string} result outcome label (VICTORY|DEFEAT|RETREAT|REVIVE).
     * @param {object|null} targetTile overworld tile that triggered the war.
     * @param {object} gameState live game state.
     * @param {object} [uiBindings] optional UI helpers for modal rendering.
     */
    function handleBattleOutcome(result, targetTile, gameState, uiBindings = {}) {
        const outcome = (result || '').toUpperCase();
        const key = getTileKey(targetTile);
        const trackedKey = kingState.firstRebelMandate.targetTileKey;
        const isTrackedBattle = kingState.firstRebelMandate.status === MandateStatus.ACTIVE
            && key && key === trackedKey;
        if (!isTrackedBattle) return;

        if ((outcome === 'DEFEAT' || outcome === 'REVIVE') && !kingState.firstRebelMandate.reprimandShown) {
            kingState.firstRebelMandate.reprimandShown = true;
            showStandardImperialDecree([
                'The frontier has been pushed back.',
                'Regroup and destroy the encampment.'
            ], uiBindings, { title: 'Imperial Reprimand' });
            return;
        }

        if (outcome === 'VICTORY') {
            kingState.firstRebelMandate.status = MandateStatus.COMPLETED;
            kingState.firstRebelMandate.targetTileKey = null;
            resetTrackedRebel(targetTile, gameState);

            showStandardImperialDecree([
                'Expand the territory while the frontier is quiet.'
            ], uiBindings, { title: 'The Emperor is pleased.' });
        }
    }

    /**
     * Convenience hook for overworld cleanup so existing listeners can forward clears
     * without duplicating mandate completion logic.
     * @param {object} tile cleared tile payload.
     * @param {object} gameState live game state reference.
     * @param {object} [uiBindings] optional UI helper overrides.
     */
    function handleTileCleared(tile, gameState, uiBindings = {}) {
        handleBattleOutcome('VICTORY', tile, gameState, uiBindings);
    }

    /**
     * Expose mandate-protected overworld keys so defeat penalties skip critical tiles.
     * @returns {Set<string>} keys that should be immune to overworld loss.
     */
    function getProtectedOverworldKeys() {
        const protectedKeys = new Set();
        if (kingState.firstRebelMandate.status === MandateStatus.ACTIVE
            && kingState.firstRebelMandate.targetTileKey) {
            protectedKeys.add(kingState.firstRebelMandate.targetTileKey);
        }
        return protectedKeys;
    }

    /**
     * Reset King state so a new campaign starts fresh and the intro mandate can re-arm.
     * Also resets the anchored decree preference so the next issuance uses the tile callout.
     */
    function resetForNewCampaign() {
        kingState.firstRebelMandate.status = MandateStatus.NOT_ISSUED;
        kingState.firstRebelMandate.targetTileKey = null;
        kingState.firstRebelMandate.reprimandShown = false;
        preferAnchoredDecree = true;
        initialMandatePending = true;
    }

    /**
     * Introspection helper primarily for tests.
     * @returns {{ firstRebelMandate: object, preferAnchoredDecree: boolean, initialMandatePending: boolean }} snapshot of mandate state.
     */
    function getKingState() {
        return {
            firstRebelMandate: { ...kingState.firstRebelMandate },
            preferAnchoredDecree,
            initialMandatePending
        };
    }

    // Legacy compatibility for older tests and helpers.
    function resetMandateState() { resetForNewCampaign(); }
    function getMandateState() { return getKingState(); }
    function initializeImperialIntro(gameState, uiBindings = {}) { issueInitialMandate(gameState, uiBindings); }
    function handleBattleEnd(result, targetTile, gameState, uiBindings = {}) { handleBattleOutcome(result, targetTile, gameState, uiBindings); }

    const api = {
        MandateStatus,
        issueInitialMandate,
        handleBattleOutcome,
        handleTileCleared,
        resetForNewCampaign,
        getKingState,
        getProtectedOverworldKeys,
        showRebelDecreeCallout,
        // legacy
        initializeImperialIntro,
        handleBattleEnd,
        getMandateState,
        resetMandateState
    };

    global.ImperialMandates = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
