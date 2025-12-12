const assert = require('assert');
const { Layout, isPointerOnDrawnHex, cubeToPixel } = require('../scripts/inputHelpers.js');

function makeLayout() {
    return { origin: { x: 0, y: 0 }, size: 30, ...Layout };
}

function testOffGridClicksBypassCombat() {
    const layout = makeLayout();
    const maps = { territory: new Map() };
    const center = cubeToPixel(layout, { q: 0, r: 0, s: 0 });

    const hit = isPointerOnDrawnHex({
        x: center.x + layout.size * 2.5,
        y: center.y + layout.size * 2.5,
        cam: layout.origin,
        zoom: 1,
        LayoutImpl: Layout,
        state: 'COMBAT',
        combatMaps: maps
    });

    const messages = [];
    if (hit.hit) messages.push('Capture First!'); else messages.push('void');
    assert.ok(!messages.includes('Capture First!'), 'off-grid clicks should bypass combat handling');
}

function testOnGridClicksStillHitCombat() {
    const layout = makeLayout();
    const key = '0,0';
    const maps = { territory: new Map([[key, { owner: 'enemy' }]]) };
    const center = cubeToPixel(layout, { q: 0, r: 0, s: 0 });

    const hit = isPointerOnDrawnHex({
        x: center.x,
        y: center.y,
        cam: layout.origin,
        zoom: 1,
        LayoutImpl: Layout,
        state: 'COMBAT',
        combatMaps: maps
    });

    const messages = [];
    if (hit.hit) messages.push('Capture First!'); else messages.push('void');
    assert.ok(messages.includes('Capture First!'), 'on-hex combat clicks should still trigger handling');
}

function testOverworldClaimablesIgnoreCombatTiles() {
    const layout = makeLayout();
    const claimableKey = '1,0';
    const combatKey = '2,0';
    const overworldMaps = { hexes: new Map(), claimable: new Map([[claimableKey, 12]]) };
    const combatMaps = { territory: new Map([[combatKey, { owner: 'foe' }]]) };

    const claimableCenter = cubeToPixel(layout, { q: 1, r: 0, s: -1 });
    const combatCenter = cubeToPixel(layout, { q: 2, r: 0, s: -2 });

    const frontierHit = isPointerOnDrawnHex({
        x: claimableCenter.x,
        y: claimableCenter.y,
        cam: layout.origin,
        zoom: 1,
        LayoutImpl: Layout,
        state: 'OVERWORLD',
        overworldMaps,
        combatMaps
    });

    const combatHit = isPointerOnDrawnHex({
        x: combatCenter.x,
        y: combatCenter.y,
        cam: layout.origin,
        zoom: 1,
        LayoutImpl: Layout,
        state: 'OVERWORLD',
        overworldMaps,
        combatMaps
    });

    assert.ok(frontierHit.hit, 'frontier tiles should remain clickable in overworld state');
    assert.ok(!combatHit.hit, 'combat tiles must be ignored while peacefully exploring');
}

function testCombatIgnoresFrontierClaimables() {
    const layout = makeLayout();
    const claimableKey = '1,0';
    const combatKey = '2,0';
    const overworldMaps = { hexes: new Map(), claimable: new Map([[claimableKey, 12]]) };
    const combatMaps = { territory: new Map([[combatKey, { owner: 'foe' }]]) };

    const claimableCenter = cubeToPixel(layout, { q: 1, r: 0, s: -1 });
    const combatCenter = cubeToPixel(layout, { q: 2, r: 0, s: -2 });

    const frontierHit = isPointerOnDrawnHex({
        x: claimableCenter.x,
        y: claimableCenter.y,
        cam: layout.origin,
        zoom: 1,
        LayoutImpl: Layout,
        state: 'COMBAT',
        overworldMaps,
        combatMaps
    });

    const combatHit = isPointerOnDrawnHex({
        x: combatCenter.x,
        y: combatCenter.y,
        cam: layout.origin,
        zoom: 1,
        LayoutImpl: Layout,
        state: 'COMBAT',
        overworldMaps,
        combatMaps
    });

    assert.ok(!frontierHit.hit, 'claimable ring should disappear during combat');
    assert.ok(combatHit.hit, 'combat territory remains active while warring');
}

function run() {
    testOffGridClicksBypassCombat();
    testOnGridClicksStillHitCombat();
    testOverworldClaimablesIgnoreCombatTiles();
    testCombatIgnoresFrontierClaimables();
    console.log('All input helper tests passed.');
}

run();
