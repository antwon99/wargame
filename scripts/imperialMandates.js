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
     * Sets up the first imperial mandate if this is a new run.
     * Should be called once when a new game starts and the overworld loads.
     * @param {object} gameState live game state.
     * @param {object} [uiBindings] optional UI helpers for modal rendering.
     */
    function initializeImperialIntro(gameState, uiBindings = {}) {
        if (firstMandateCompleted || firstMandateActive) return;
        const opener = {
            title: 'By Imperial Decree:',
            lines: ['Patrol the frontier.', 'Rebels have been sighted nearby.'],
            buttonLabel: 'Understood',
            onConfirm: () => {
                const rebelTile = RebelSystem.spawnRebelCampNearFrontier?.(gameState, { enemyLevel: 1 });
                if (!rebelTile) {
                    console.warn('Imperial mandate could not place a rebel camp.');
                    return;
                }
                firstMandateRebelTileId = getTileKey(rebelTile);
                firstMandateActive = true;
                showImperialMessage({
                    title: 'Frontier Warning',
                    lines: ['Scouts report a bandit encampment.', 'Destroy it to secure the border.'],
                    buttonLabel: 'On it'
                }, uiBindings);
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
     * Introspection helper primarily for tests.
     * @returns {{ firstMandateActive: boolean, firstMandateRebelTileId: string|null, firstMandateCompleted: boolean }}
     */
    function getMandateState() {
        return { firstMandateActive, firstMandateRebelTileId, firstMandateCompleted };
    }

    /** Reset internal flags for deterministic tests. */
    function resetMandateState() {
        firstMandateActive = false;
        firstMandateRebelTileId = null;
        firstMandateCompleted = false;
    }

    const api = {
        initializeImperialIntro,
        handleTileCleared,
        getMandateState,
        resetMandateState
    };

    global.ImperialMandates = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
