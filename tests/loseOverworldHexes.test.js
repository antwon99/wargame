const assert = require('assert');
const { loseOverworldHexes } = require('../scripts/combatEngine.js');

class Hex {
    constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
    toString() { return `${this.q},${this.r}`; }
    static neighbor(hex, dir) {
        const dirs = [
            new Hex(1, 0, -1), new Hex(1, -1, 0), new Hex(0, -1, 1),
            new Hex(-1, 0, 1), new Hex(-1, 1, 0), new Hex(0, 1, -1)
        ];
        const delta = dirs[dir];
        return new Hex(hex.q + delta.q, hex.r + delta.r, hex.s + delta.s);
    }
}

function buildGameState(coords) {
    const gameState = {
        Hex,
        overworld: { hexes: new Map() },
        calcOverworldGhosts: () => { gameState.ghostsCalculated = true; }
    };
    coords.forEach(([q, r, type = 'field']) => {
        const hex = new Hex(q, r);
        gameState.overworld.hexes.set(hex.toString(), { hex, type });
    });
    return gameState;
}

function testFrontierRecalculationRemovesOuterRingFirst() {
    const coords = [
        [0, 0], [1, 0], [2, 0], [3, 0], [4, 0]
    ];
    const gameState = buildGameState(coords);

    const removed = loseOverworldHexes(gameState, 2);
    assert.strictEqual(removed, 2, 'should remove requested number of tiles when available');
    assert.ok(!gameState.overworld.hexes.has('4,0'), 'farthest frontier tile should be removed first');
    assert.ok(!gameState.overworld.hexes.has('3,0'), 'frontier should be recomputed after each removal');
    assert.ok(gameState.overworld.hexes.has('2,0'), 'inner tiles should remain until they become exposed');
    assert.ok(gameState.ghostsCalculated, 'overworld ghost recalculation should run after removals');
}

function testProtectedTilesStopFurtherLoss() {
    const coords = [
        [0, 0, 'castle'], [1, 0], [2, 0]
    ];
    const gameState = buildGameState(coords);
    const protectedKeys = new Set(['1,0']);

    const removed = loseOverworldHexes(gameState, 5, protectedKeys);
    assert.strictEqual(removed, 1, 'removal should stop when only protected tiles remain');
    assert.ok(gameState.overworld.hexes.has('1,0'), 'protected tiles must be preserved');
    assert.ok(!gameState.overworld.hexes.has('2,0'), 'unprotected tiles can still be removed');
}

function run() {
    testFrontierRecalculationRemovesOuterRingFirst();
    testProtectedTilesStopFurtherLoss();
    console.log('All loseOverworldHexes tests passed.');
}

run();
