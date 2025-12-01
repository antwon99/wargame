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

function run() {
    testOffGridClicksBypassCombat();
    testOnGridClicksStillHitCombat();
    console.log('All input helper tests passed.');
}

run();
