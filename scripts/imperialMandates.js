/**
 * Imperial mandate flow for introducing the rebel threat. Handles the first decree,
 * spawns a rebel camp, and listens for its destruction to provide narrative closure.
 */
(function (global) {
    const RebelSystem = (global.RebelSystem)
        || (typeof require === 'function' ? require('./rebelSystem.js') : {});
    const TutorialCallouts = (global.TutorialCallouts)
        || (typeof require === 'function' ? require('./tutorialCallouts.js') : null);

    let firstMandateActive = false;
    let firstMandateRebelTileId = null;
    let firstMandateCompleted = false;
    let firstMandateReprimandShown = false; // prevents repeat reprimands if the player loses multiple times

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
        const { title, lines, buttonLabel, onConfirm } = config;
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

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'imperial-modal-btn';
        btn.innerText = buttonLabel || 'Understood';
        btn.addEventListener('click', () => {
            backdrop.remove();
            if (typeof onConfirm === 'function') onConfirm();
        });
        panel.appendChild(btn);

        backdrop.appendChild(panel);
        document.body.appendChild(backdrop);
    }

    function showImperialMessage(config, uiBindings) {
        if (uiBindings?.showImperialModal) {
            uiBindings.showImperialModal(config);
            return;
        }
        renderImperialModal(config);
    }

    /**
     * Present the initial imperial decree as a spatially anchored callout next to the rebel camp.
     * Falls back to the modal renderer when callouts are unavailable (tests/headless environments).
     * @param {object} rebelTile tile the callout should point toward.
     * @param {object} gameState live game state for projection helpers.
     * @param {object} uiBindings optional UI helper overrides.
     */
    function showRebelDecreeCallout(rebelTile, gameState, uiBindings) {
        const bodyHtml = ['Patrol the frontier.', 'Rebels have been sighted nearby.', 'Expand the Empire’s reach — and survive the rebels beyond the fog.'].join('<br>');
        const showTileCallout = uiBindings?.showTileCallout
            || (TutorialCallouts && TutorialCallouts.showTileCallout);
        const hideTileCallout = uiBindings?.hideTileCallout
            || (TutorialCallouts && TutorialCallouts.hideTileCallout);

        if (typeof showTileCallout === 'function') {
            const calloutOptions = {
                title: 'By Imperial Decree:',
                body: bodyHtml,
                buttonText: 'Understood',
                onConfirm: () => {
                    if (typeof hideTileCallout === 'function') hideTileCallout();
                }
            };

            // uiBindings may pass the raw helper (expects game first) or a game-bound wrapper (tile first).
            const expectsGameFirst = showTileCallout.length >= 3;
            if (expectsGameFirst) {
                showTileCallout(gameState, rebelTile, calloutOptions);
            } else {
                showTileCallout(rebelTile, calloutOptions);
            }
            return;
        }

        showImperialMessage({
            title: 'By Imperial Decree:',
            lines: bodyHtml.split('<br>'),
            buttonLabel: 'Understood',
            onConfirm: () => {
                if (typeof hideTileCallout === 'function') hideTileCallout();
            }
        }, uiBindings);
    }

    /**
     * Sets up the first imperial mandate if this is a new run.
     * Should be called once when a new game starts and the overworld loads.
     * @param {object} gameState live game state.
     * @param {object} [uiBindings] optional UI helpers for modal rendering.
     */
    function initializeImperialIntro(gameState, uiBindings = {}) {
        if (firstMandateCompleted || firstMandateActive) return;
        firstMandateReprimandShown = false;
        const rebelTile = RebelSystem.spawnRebelCampNearFrontier?.(gameState, { enemyLevel: 1 });
        if (!rebelTile) {
            console.warn('Imperial mandate could not place a rebel camp.');
            return;
        }

        firstMandateRebelTileId = getTileKey(rebelTile);
        firstMandateActive = true;
        showRebelDecreeCallout(rebelTile, gameState, uiBindings);
        if (typeof gameState?.playSound === 'function') gameState.playSound('wardrum', { allowOverlap: true });
    }

    /**
     * Called by combat/overworld code whenever a tile has been cleared of enemies.
     * If the tile was the tracked rebel camp, completes the first mandate and shows
     * the Emperor's response.
     * @param {object} tile cleared tile payload.
     * @param {object} gameState live game state reference.
     * @param {object} [uiBindings] optional UI helper overrides.
     */
    function handleTileCleared(tile, gameState, uiBindings = {}) {
        if (!firstMandateActive) return;
        const key = getTileKey(tile);
        if (!key || key !== firstMandateRebelTileId) return;

        firstMandateActive = false;
        firstMandateCompleted = true;
        resetTrackedRebel(tile, gameState);

        showImperialMessage({
            title: 'The Emperor is pleased.',
            lines: ['Expand the territory while the frontier is quiet.'],
            buttonLabel: 'Continue'
        }, uiBindings);
    }

    /**
     * Respond to the conclusion of a battle so mandate text can react to defeat
     * or triumph against the first rebel camp without altering combat logic.
     * @param {string} result outcome label (VICTORY|DEFEAT|RETREAT|REVIVE)
     * @param {object|null} targetTile overworld tile that triggered the war.
     * @param {object} gameState live game state.
     * @param {object} [uiBindings] optional UI helpers for modal rendering.
     */
    function handleBattleEnd(result, targetTile, gameState, uiBindings = {}) {
        const outcome = (result || '').toUpperCase();
        const key = getTileKey(targetTile);
        const isTrackedBattle = firstMandateActive && key && key === firstMandateRebelTileId;
        if (!isTrackedBattle) return;

        if ((outcome === 'DEFEAT' || outcome === 'REVIVE') && !firstMandateReprimandShown) {
            firstMandateReprimandShown = true;
            showImperialMessage({
                title: 'Imperial Reprimand',
                lines: ['The frontier has been pushed back.', 'Regroup and destroy the encampment.'],
                buttonLabel: 'We will not fail again'
            }, uiBindings);
            return;
        }

        if (outcome === 'VICTORY') {
            handleTileCleared(targetTile, gameState, uiBindings);
        }
    }

    /**
     * Introspection helper primarily for tests.
     * @returns {{ firstMandateActive: boolean, firstMandateRebelTileId: string|null, firstMandateCompleted: boolean }}
     */
    function getMandateState() {
        return { firstMandateActive, firstMandateRebelTileId, firstMandateCompleted, firstMandateReprimandShown };
    }

    /** Reset internal flags for deterministic tests. */
    function resetMandateState() {
        firstMandateActive = false;
        firstMandateRebelTileId = null;
        firstMandateCompleted = false;
        firstMandateReprimandShown = false;
    }

    const api = {
        initializeImperialIntro,
        handleTileCleared,
        handleBattleEnd,
        getMandateState,
        resetMandateState
    };

    global.ImperialMandates = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
