import assert from 'assert';
import { TutorialHandler } from '../scripts/tutorialHandler.js';

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
}

function buildGameState() {
    return {
        Hex,
        overworld: { hexes: new Map() },
        timekeeper: { ticks: 5 }
    };
}

function testSpawnTracksFrontierSweepCamp() {
    const gameState = buildGameState();
    const hex = new Hex(0, 0);
    gameState.overworld.hexes.set(hex.toString(), { hex, type: 'field', owner: 'player' });

    const rebelTile = TutorialHandler.spawnFrontierSweepCamp(gameState, { enemyLevel: 1, source: 'test' });
    assert.ok(rebelTile, 'spawn should return a rebel tile');
    assert.strictEqual(rebelTile.type, 'rebelcamp', 'spawned tile should be a rebel camp');

    const tutorialState = TutorialHandler.getFrontierSweepState(gameState);
    assert.strictEqual(
        tutorialState.targetTileKey,
        hex.toString(),
        'tutorial handler should store the rebel camp key'
    );
    assert.strictEqual(tutorialState.spreadImmune, true, 'tutorial camp should default to spread immunity');
    assert.strictEqual(tutorialState.enemyLevel, 1, 'tutorial handler should capture enemy level presets');
}

function testClearFrontierSweepCamp() {
    const gameState = buildGameState();
    const hex = new Hex(0, 0);
    gameState.overworld.hexes.set(hex.toString(), { hex, type: 'rebelcamp', owner: 'rebel', isRebelCamp: true });
    TutorialHandler.markFrontierSweepCamp(gameState, { hex });

    const cleared = TutorialHandler.clearFrontierSweepCamp(gameState, hex);
    assert.strictEqual(cleared, true, 'clear should return true when matching camp is cleared');
    const tutorialState = TutorialHandler.getFrontierSweepState(gameState);
    assert.strictEqual(tutorialState.targetTileKey, null, 'clearing should reset the tracked rebel camp key');
}

testSpawnTracksFrontierSweepCamp();
testClearFrontierSweepCamp();
console.log('Tutorial handler tests passed.');
