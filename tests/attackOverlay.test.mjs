import assert from 'assert';
import { applyUIBindings } from '../scripts/uiBindings.js';

function createElementStub() {
    const element = {
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        style: { setProperty: () => {} },
        dataset: {},
        children: [],
        appendChild(child) { this.children.push(child); },
        setAttribute: () => {},
        addEventListener: () => {},
        remove: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 })
    };
    return element;
}

function createDocumentStub(elementsById) {
    return {
        body: createElementStub(),
        getElementById: (id) => elementsById[id] || null,
        createElement: () => createElementStub()
    };
}

function run() {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const originalRebelSystem = global.RebelSystem;

    const layer = createElementStub();
    const button = createElementStub();
    button.style.display = 'none';

    global.document = createDocumentStub({
        'game-container': createElementStub(),
        'tile-action-layer': layer,
        'tile-attack-overlay-btn': button
    });
    global.window = { addEventListener: () => {}, removeEventListener: () => {} };
    global.RebelSystem = {
        isRebelCampTile: (tile) => Boolean(tile?.isRebelCamp)
    };

    const game = {
        state: 'OVERWORLD',
        overworld: { hexes: new Map() },
        beginBattleFromTile: () => { game.battleStarted = true; },
        projectHexToScreen: () => ({ x: 120, y: 160 })
    };

    applyUIBindings(game);

    const tile = { isRebelCamp: true, type: 'rebelcamp', owner: 'rebel', hex: { toString: () => '0,0' } };
    game.overworld.hexes.set('0,0', tile);
    game.updateTileAttackOverlay(tile);

    assert.strictEqual(button.style.display, 'inline-flex', 'attack overlay should render when a rebel camp is selected');

    button.onclick({ stopPropagation: () => {} });

    assert.strictEqual(button.style.display, 'none', 'attack overlay should hide immediately after clicking attack');
    assert.strictEqual(game.battleStarted, true, 'attack click should begin combat');

    game.overworld.hexes.set('0,0', { hex: tile.hex, type: 'field', owner: 'player' });
    game.updateTileAttackOverlay(tile);
    assert.strictEqual(button.style.display, 'none', 'attack overlay should remain hidden if the rebel camp is gone');

    global.document = originalDocument;
    global.window = originalWindow;
    global.RebelSystem = originalRebelSystem;

    console.log('Attack overlay tests passed.');
}

run();
