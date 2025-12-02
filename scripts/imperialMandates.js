/**
 * Imperial mandate flow for introducing the rebel threat. Handles the first decree,
 * spawns a rebel camp, and listens for its destruction to provide narrative closure.
 */
(function (global) {
    const RebelSystem = (global.RebelSystem)
        || (typeof require === 'function' ? require('./rebelSystem.js') : {});

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

    /**
     * Lightweight directional hint for the first rebel camp; shown near the
     * targeted hex instead of blocking the screen with another modal.
     * @param {object} rebelTile rebel tile reference.
     * @param {object} gameState live game state for projection helpers.
     */
    function renderFrontierHint(rebelTile, gameState) {
        if (typeof document === 'undefined' || !rebelTile) return;
        const layer = document.getElementById('tile-action-layer') || document.body;
        const hint = document.createElement('div');
        hint.className = 'rebel-hint';
        hint.innerText = '⬆ The rebel camp is here';

        let pos = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.35 };
        const hex = rebelTile.hex || rebelTile;
        if (typeof gameState?.projectHexToScreen === 'function') {
            pos = gameState.projectHexToScreen(hex);
        } else if (hex && typeof hex.toPixel === 'function') {
            pos = hex.toPixel({ origin: { x: 0, y: 0 }, size: 30, f0: Math.sqrt(3), f1: Math.sqrt(3) / 2, f2: 0, f3: 1.5 });
        }

        hint.style.left = `${pos.x - 64}px`;
        hint.style.top = `${pos.y - 86}px`;
        layer.appendChild(hint);
        setTimeout(() => hint.remove(), 10000);
    }

    function showImperialMessage(config, uiBindings) {
        if (uiBindings?.showImperialModal) {
            uiBindings.showImperialModal(config);
            return;
        }
        renderImperialModal(config);
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
        const opener = {
            title: 'By Imperial Decree:',
            lines: [
                'Patrol the frontier.',
                'Rebels have been sighted nearby.',
                'Expand the Empire’s reach — and survive the rebels beyond the fog.'
            ],
            buttonLabel: 'Understood',
            onConfirm: () => {
                const rebelTile = RebelSystem.spawnRebelCampNearFrontier?.(gameState, { enemyLevel: 1 });
                if (!rebelTile) {
                    console.warn('Imperial mandate could not place a rebel camp.');
                    return;
                }
                firstMandateRebelTileId = getTileKey(rebelTile);
                firstMandateActive = true;
                if (uiBindings?.showRebelHint) {
                    uiBindings.showRebelHint(rebelTile);
                } else {
                    renderFrontierHint(rebelTile, gameState);
                }
                if (typeof gameState?.playSound === 'function') gameState.playSound('wardrum', { allowOverlap: true });
            }
        };

        showImperialMessage(opener, uiBindings);
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
