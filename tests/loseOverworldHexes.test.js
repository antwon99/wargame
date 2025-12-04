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

function withMockedRandom(sequence, fn) {
    const originalRandom = Math.random;
    let index = 0;
    Math.random = () => {
        if (Array.isArray(sequence)) {
            const value = sequence[Math.min(index, sequence.length - 1)];
            index += 1;
            return value;
        }
        return sequence;
    };
    try {
        fn();
    } finally {
        Math.random = originalRandom;
    }
}

function testFrontierConversionMarksOuterRingFirst() {
    const coords = [
        [0, 0], [1, 0], [2, 0], [3, 0], [4, 0]
    ];
    const gameState = buildGameState(coords);

    withMockedRandom([0.1, 0.9], () => {
        const removed = loseOverworldHexes(gameState, 2);
        assert.strictEqual(removed, 2, 'should convert requested number of tiles when available');
    });

    const scorchedFrontier = gameState.overworld.hexes.get('4,0');
    const rebelFrontier = gameState.overworld.hexes.get('3,0');
    assert.strictEqual(gameState.overworld.hexes.size, coords.length, 'converted tiles should remain on the map');
    assert.strictEqual(scorchedFrontier.type, 'scorched', 'farthest frontier tile should be scorched first');
    assert.strictEqual(scorchedFrontier.owner, 'scorched', 'scorched tiles should carry a matching owner flag');
    assert.strictEqual(rebelFrontier.type, 'rebel', 'subsequent frontier should convert after recalculation');
    assert.strictEqual(rebelFrontier.owner, 'rebel', 'rebel takeovers should mark ownership');
    assert.ok(gameState.overworld.hexes.has('2,0'), 'inner tiles should remain until they become exposed');
    assert.ok(gameState.ghostsCalculated, 'overworld ghost recalculation should run after conversions');
}

function testProtectedTilesStopFurtherLoss() {
    const coords = [
        [0, 0, 'castle'], [1, 0], [2, 0]
    ];
    const gameState = buildGameState(coords);
    const protectedKeys = new Set(['1,0']);

    withMockedRandom(0.2, () => {
        const removed = loseOverworldHexes(gameState, 5, protectedKeys);
        assert.strictEqual(removed, 1, 'conversion should stop when only protected tiles remain');
    });

    assert.strictEqual(gameState.overworld.hexes.get('2,0').type, 'scorched', 'unprotected tiles can still be lost');
    assert.strictEqual(gameState.overworld.hexes.get('1,0').type, 'field', 'protected tiles must be preserved');
}

function run() {
    testFrontierConversionMarksOuterRingFirst();
    testProtectedTilesStopFurtherLoss();
    console.log('All loseOverworldHexes tests passed.');
}

run();
