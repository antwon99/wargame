import assert from 'assert';
import { RebelSystem } from '../scripts/rebelSystem.js';

class Hex {
    constructor(q, r, s = -q - r) {
        this.q = q;
        this.r = r;
        this.s = s;
    }
    toString() {
        return `${this.q},${this.r}`;
    }
    static neighbor(hex, dir) {
        const dirs = [
            new Hex(1, 0, -1), new Hex(1, -1, 0), new Hex(0, -1, 1),
            new Hex(-1, 0, 1), new Hex(-1, 1, 0), new Hex(0, 1, -1)
        ];
        return new Hex(hex.q + dirs[dir].q, hex.r + dirs[dir].r, hex.s + dirs[dir].s);
    }
    static distance(a, b) {
        return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
    }
}

function buildGameState() {
    return {
        Hex,
        overworld: { hexes: new Map() }
    };
}

function testStarterCampUsesOpenCastleNeighbor() {
    const gameState = buildGameState();
    const castleHex = new Hex(0, 0);
    gameState.overworld.hexes.set(castleHex.toString(), { hex: castleHex, type: 'castle', owner: 'player' });

    for (let dir = 1; dir < 6; dir += 1) {
        const neighbor = Hex.neighbor(castleHex, dir);
        gameState.overworld.hexes.set(neighbor.toString(), { hex: neighbor, type: 'forest', owner: 'player' });
    }

    const starterCamp = RebelSystem.spawnStarterRebelCampNearCastle(gameState, { rng: () => 0 });
    const expectedHex = Hex.neighbor(castleHex, 0);

    assert.ok(starterCamp, 'starter camp should spawn when an open neighbor exists');
    assert.strictEqual(starterCamp.hex.toString(), expectedHex.toString(), 'camp should claim the open neighbor slot');
    assert.strictEqual(starterCamp.type, 'rebelcamp', 'camp tile should use rebel camp type');

    for (let dir = 1; dir < 6; dir += 1) {
        const neighbor = Hex.neighbor(castleHex, dir);
        const tile = gameState.overworld.hexes.get(neighbor.toString());
        assert.strictEqual(tile.type, 'forest', 'existing starter tiles should remain unchanged');
    }
}

function testStarterCampFallsBackToNearestFrontier() {
    const gameState = buildGameState();
    const castleHex = new Hex(0, 0);
    gameState.overworld.hexes.set(castleHex.toString(), { hex: castleHex, type: 'castle', owner: 'player' });

    for (let dir = 0; dir < 6; dir += 1) {
        const neighbor = Hex.neighbor(castleHex, dir);
        gameState.overworld.hexes.set(neighbor.toString(), { hex: neighbor, type: 'town', owner: 'player' });
    }

    const startingKeys = new Set(gameState.overworld.hexes.keys());
    const starterCamp = RebelSystem.spawnStarterRebelCampNearCastle(gameState, { rng: () => 0.4 });

    assert.ok(starterCamp, 'starter camp should spawn from the frontier fallback');
    assert.ok(!startingKeys.has(starterCamp.hex.toString()), 'starter camp should add a new hex');
    assert.strictEqual(Hex.distance(castleHex, starterCamp.hex), 2, 'fallback camp should stay closest to the castle');

    startingKeys.forEach((key) => {
        const tile = gameState.overworld.hexes.get(key);
        assert.ok(tile, 'original starter tiles should remain in the map');
        assert.notStrictEqual(tile.type, 'rebelcamp', 'starter camp should not replace existing tiles');
    });
}

testStarterCampUsesOpenCastleNeighbor();
testStarterCampFallsBackToNearestFrontier();
console.log('Starter rebel camp tests passed.');
