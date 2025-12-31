import assert from 'assert';
import { damageBuilding, loseOverworldHexes } from '../scripts/combatEngine.js';

class Hex {
    constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
    toString() { return `${this.q},${this.r}`; }
    equals(other) { return other && this.q === other.q && this.r === other.r && this.s === other.s; }
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
        const report = loseOverworldHexes(gameState, 2);
        assert.strictEqual(report.lost, 2, 'should convert requested number of tiles when available');
        assert.strictEqual(report.conversions.length, 2, 'loss report should include each converted tile');
        assert.deepStrictEqual(
            report.conversions.map((conv) => conv.key),
            ['4,0', '3,0'],
            'conversion ordering should remain stable by distance and key for deterministic fates'
        );
    });

    const scorchedFrontier = gameState.overworld.hexes.get('4,0');
    const rebelFrontier = gameState.overworld.hexes.get('3,0');
    assert.strictEqual(gameState.overworld.hexes.size, coords.length, 'converted tiles should remain on the map');
    assert.strictEqual(scorchedFrontier.type, 'scorched', 'farthest frontier tile should be scorched first');
    assert.strictEqual(scorchedFrontier.owner, 'scorched', 'scorched tiles should carry a matching owner flag');
    assert.strictEqual(rebelFrontier.type, 'rebelcamp', 'subsequent frontier should convert after recalculation');
    assert.strictEqual(rebelFrontier.owner, 'rebel', 'rebel camps should mark rebel ownership');
    assert.strictEqual(rebelFrontier.isRebelCamp, true, 'rebel camps should be flagged for combat cleanup');
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
        const report = loseOverworldHexes(gameState, 5, protectedKeys);
        assert.strictEqual(report.lost, 1, 'conversion should stop when only protected tiles remain');
        assert.ok(report.convertedKeys.has('2,0'), 'report should capture converted keys for UI hooks');
    });

    assert.strictEqual(gameState.overworld.hexes.get('2,0').type, 'scorched', 'unprotected tiles can still be lost');
    assert.strictEqual(gameState.overworld.hexes.get('1,0').type, 'field', 'protected tiles must be preserved');
}

function testLossReportTracksFates() {
    const coords = [
        [0, 0, 'castle'], [1, 0], [2, 0], [3, 0]
    ];
    const gameState = buildGameState(coords);

    withMockedRandom([0.2, 0.7, 0.2], () => {
        const report = loseOverworldHexes(gameState, 3);
        assert.strictEqual(report.counts.scorched, 2, 'loss report should tally scorched tiles');
        assert.strictEqual(report.counts.rebelcamp, 1, 'loss report should tally rebel camps');
        assert.strictEqual(report.conversions[0].hex.toString(), '3,0', 'report should carry converted hex references for FX');
    });
}

function testWarModeScorchesDestroyedHexes() {
    const gameState = {
        Hex,
        parseKey: (key) => {
            const [q, r] = key.split(',').map(Number);
            return new Hex(q, r, -q - r);
        },
        combat: {
            buildings: new Map(),
            territory: new Map(),
            castles: { player: new Hex(0, 0, 0), enemy: new Hex(5, 5, -10) }
        },
        spawnTxt: () => {}
    };

    const castleHex = new Hex(0, 0, 0);
    const frontierHex = new Hex(1, 0, -1);
    gameState.combat.territory.set(castleHex.toString(), { owner: 'player', hex: castleHex });
    gameState.combat.territory.set(frontierHex.toString(), { owner: 'player', hex: frontierHex });
    gameState.combat.buildings.set(frontierHex.toString(), { type: 'tower', hp: 5, owner: 'player' });

    damageBuilding(gameState, frontierHex.toString(), 999, 'enemy');

    const scorchedTile = gameState.combat.territory.get(frontierHex.toString());
    assert.strictEqual(scorchedTile.owner, 'scorched', 'destroyed tiles during war should be scorched regardless of connectivity');
    assert.ok(!gameState.combat.buildings.has(frontierHex.toString()), 'destroyed building should be removed from combat registry');
}

function run() {
    testFrontierConversionMarksOuterRingFirst();
    testProtectedTilesStopFurtherLoss();
    testLossReportTracksFates();
    testWarModeScorchesDestroyedHexes();
    console.log('All loseOverworldHexes tests passed.');
}

run();
