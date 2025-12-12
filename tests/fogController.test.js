const assert = require('assert');
const {
    shouldApplyCombatFog,
    getTileVisibilityMap,
    renderFogBackdrop
} = require('../scripts/fogController.js');

class Hex {
    constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
    toString() { return `${this.q},${this.r}`; }
    toPixel() { return { x: this.q * 10, y: this.r * 10 }; }
    static neighbor(hex, dir) {
        const dirs = [
            new Hex(1, 0, -1), new Hex(1, -1, 0), new Hex(0, -1, 1),
            new Hex(-1, 0, 1), new Hex(-1, 1, 0), new Hex(0, 1, -1)
        ];
        const delta = dirs[dir];
        return new Hex(hex.q + delta.q, hex.r + delta.r, hex.s + delta.s);
    }
}

function buildCtx() {
    const calls = [];
    return {
        calls,
        fillStyle: '#000',
        globalAlpha: 1,
        fillRect: (...args) => calls.push(['fillRect', ...args]),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {}
    };
}

function buildGame({ visualMode = 'void', state = 'COMBAT' } = {}) {
    const overworldHex = new Hex(0, 0);
    return {
        state,
        Hex,
        cam: { zoom: 1 },
        viewport: { width: 100, height: 100 },
        fog: { time: 0, visualConfig: { enabled: true, visualMode, voidFill: '#000' } },
        featureToggles: { fog: { visualMode } },
        overworld: { hexes: new Map([[overworldHex.toString(), { hex: overworldHex, owner: 'player' }]]), claimable: new Map() },
        combat: { territory: new Map([['1,0', { owner: 'enemy', hex: new Hex(1, 0) }]]) },
        ctx: buildCtx(),
        parseKey: (key) => { const [q, r] = key.split(',').map(Number); return new Hex(q, r, -q - r); },
        isVoidVisualMode: () => visualMode === 'void'
    };
}

function testCombatFogOnlyEnablesSeasonalSnow() {
    const winter = new Date('2024-12-15T00:00:00Z');
    const summer = new Date('2024-07-15T00:00:00Z');
    const game = buildGame({ visualMode: 'seasonalSnow' });

    assert.strictEqual(shouldApplyCombatFog({ ...game, state: 'OVERWORLD' }, winter), false, 'overworld should never use combat fog');
    assert.strictEqual(shouldApplyCombatFog(game, summer), false, 'non-winter months should ignore seasonal combat fog');
    assert.strictEqual(shouldApplyCombatFog(game, winter), true, 'winter seasonal snow should enable combat fog');
}

function testVisibilityMapSkipsCombatWhenFogDisabled() {
    const game = buildGame({ visualMode: 'void' });
    const visibility = getTileVisibilityMap(game);
    assert.ok(!visibility.has('1,0'), 'combat territory should not be marked visible when combat fog is off');
    assert.strictEqual(visibility.get('0,0'), 'visible', 'owned overworld tiles should stay visible');
}

function testVisibilityIncludesCombatWhenEnabled() {
    const game = buildGame({ visualMode: 'seasonalSnow' });
    const visibility = getTileVisibilityMap(game);
    assert.strictEqual(visibility.get('1,0'), 'seen', 'combat territory should be dimmed when fog is enabled');
}

function testRenderFogSkipsMasksDuringCombat() {
    const game = buildGame({ visualMode: 'void' });
    let maskCalls = 0;
    renderFogBackdrop(game, { size: 24, origin: { x: 0, y: 0 } }, { tileMaskProvider: () => { maskCalls += 1; return new Set(); } });
    assert.strictEqual(maskCalls, 0, 'tile mask provider should not run when combat fog is disabled');
    assert.strictEqual(game.fog.tileMask, null, 'fog mask should remain null in combat without fog');
}

function run() {
    testCombatFogOnlyEnablesSeasonalSnow();
    testVisibilityMapSkipsCombatWhenFogDisabled();
    testVisibilityIncludesCombatWhenEnabled();
    testRenderFogSkipsMasksDuringCombat();
    console.log('All fogController tests passed.');
}

run();
