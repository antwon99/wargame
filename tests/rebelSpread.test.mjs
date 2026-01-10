import assert from 'assert';
import { applyOverworldIncome } from '../scripts/overworldTicks.js';
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
}

function withPatchedRandom(sequence, fn) {
    const original = Math.random;
    let idx = 0;
    Math.random = () => {
        const value = sequence[Math.min(idx, sequence.length - 1)];
        idx += 1;
        return value;
    };
    try { fn(); } finally { Math.random = original; }
}

function buildGameState() {
    return {
        Hex,
        gold: 0,
        wood: 0,
        overworld: { hexes: new Map() },
        research: { bonuses: {} },
        timekeeper: {
            ticks: 0,
            advance: function advance() { this.ticks += 1; }
        },
        updateHUD: () => {},
        updateUpgradeMenu: () => {}
    };
}

function testSpreadChanceScalesWithMisses() {
    const baseChance = 0.02;
    const growth = 0.03;
    const earlyChance = RebelSystem.getRebelSpreadChance({}, {
        misses: 0,
        baseChance,
        growth,
        monthTicks: 30
    });
    const secondChance = RebelSystem.getRebelSpreadChance({}, {
        misses: 1,
        baseChance,
        growth,
        monthTicks: 30
    });
    const laterChance = RebelSystem.getRebelSpreadChance({}, {
        misses: 3,
        baseChance,
        growth,
        monthTicks: 30
    });
    const guaranteedChance = RebelSystem.getRebelSpreadChance({}, {
        misses: 30,
        baseChance,
        monthTicks: 30
    });
    assert.strictEqual(earlyChance, 0.02, 'spread chance should start with the base chance');
    assert.strictEqual(secondChance, 0.05, 'spread chance should rise after failed rolls');
    assert.strictEqual(laterChance, 0.11, 'spread chance should keep scaling with misses');
    assert.ok(Math.abs(guaranteedChance - 1) < 1e-6, 'spread chance should guarantee a spawn by month end');
}

function testSpreadConvertsAdjacentPlayerTile() {
    const gameState = buildGameState();
    const rebelHex = new Hex(0, 0);
    const targetHex = new Hex(1, 0);
    gameState.overworld.hexes.set(rebelHex.toString(), {
        hex: rebelHex,
        type: 'rebelcamp',
        owner: 'rebel',
        isRebelCamp: true
    });
    gameState.overworld.hexes.set(targetHex.toString(), {
        hex: targetHex,
        type: 'forest',
        owner: 'player'
    });

    const conversions = RebelSystem.spreadRebelCamps(gameState, { chance: 1, rng: () => 0 });
    assert.strictEqual(conversions.length, 1, 'spread should convert one tile when guaranteed');
    const updated = gameState.overworld.hexes.get(targetHex.toString());
    assert.strictEqual(updated.owner, 'rebel', 'spread should flip ownership to rebel');
    assert.strictEqual(updated.type, 'rebelcamp', 'spread should convert the tile into a rebel camp');
    assert.strictEqual(updated.prevType, 'forest', 'spread should remember the replaced terrain');
}

function testSpreadSkipsProtectedCamp() {
    const gameState = buildGameState();
    const rebelHex = new Hex(0, 0);
    const targetHex = new Hex(1, 0);
    gameState.overworld.hexes.set(rebelHex.toString(), {
        hex: rebelHex,
        type: 'rebelcamp',
        owner: 'rebel',
        isRebelCamp: true
    });
    gameState.overworld.hexes.set(targetHex.toString(), {
        hex: targetHex,
        type: 'field',
        owner: 'player'
    });

    const conversions = RebelSystem.spreadRebelCamps(gameState, {
        chance: 1,
        rng: () => 0,
        protectedKeys: new Set([rebelHex.toString()])
    });
    assert.strictEqual(conversions.length, 0, 'protected rebel camps should skip spread rolls');
    const updated = gameState.overworld.hexes.get(targetHex.toString());
    assert.strictEqual(updated.owner, 'player', 'protected camps should not convert adjacent tiles');
}

function testOverworldTickTriggersRebelSpread() {
    const gameState = buildGameState();
    const rebelHex = new Hex(0, 0);
    const targetHex = new Hex(1, 0);
    gameState.overworld.hexes.set(rebelHex.toString(), {
        hex: rebelHex,
        type: 'rebelcamp',
        owner: 'rebel',
        isRebelCamp: true
    });
    gameState.overworld.hexes.set(targetHex.toString(), {
        hex: targetHex,
        type: 'field',
        owner: 'player'
    });
    gameState.overworld.hexes.set('2,0', { hex: new Hex(2, 0), type: 'town', owner: 'player' });

    withPatchedRandom([0, 0], () => {
        applyOverworldIncome(gameState);
    });

    const updated = gameState.overworld.hexes.get(targetHex.toString());
    assert.strictEqual(updated.type, 'rebelcamp', 'daily ticks should allow rebel camps to spread');
    assert.strictEqual(updated.owner, 'rebel', 'spread should take over the player tile');
}

function testTutorialCampIgnoresDailySpread() {
    const gameState = buildGameState();
    const rebelHex = new Hex(0, 0);
    const targetHex = new Hex(1, 0);
    gameState.overworld.hexes.set(rebelHex.toString(), {
        hex: rebelHex,
        type: 'rebelcamp',
        owner: 'rebel',
        isRebelCamp: true
    });
    gameState.overworld.hexes.set(targetHex.toString(), {
        hex: targetHex,
        type: 'field',
        owner: 'player'
    });
    gameState.tutorial = {
        frontierSweep: {
            targetTileKey: rebelHex.toString(),
            spreadImmune: true
        }
    };

    withPatchedRandom([0, 0], () => {
        applyOverworldIncome(gameState);
    });

    const updated = gameState.overworld.hexes.get(targetHex.toString());
    assert.strictEqual(updated.owner, 'player', 'tutorial rebel camp should ignore daily spread rolls');
}

function testFrontierSweepGracePeriodBlocksSpread() {
    const gameState = buildGameState();
    const rebelHex = new Hex(0, 0);
    const targetHex = new Hex(1, 0);
    gameState.overworld.hexes.set(rebelHex.toString(), {
        hex: rebelHex,
        type: 'rebelcamp',
        owner: 'rebel',
        isRebelCamp: true
    });
    gameState.overworld.hexes.set(targetHex.toString(), {
        hex: targetHex,
        type: 'field',
        owner: 'player'
    });
    gameState.tutorial = {
        frontierSweep: {
            targetTileKey: rebelHex.toString(),
            completionTick: null,
            spreadImmune: false
        }
    };

    withPatchedRandom([0, 0], () => {
        applyOverworldIncome(gameState);
    });

    const updated = gameState.overworld.hexes.get(targetHex.toString());
    assert.strictEqual(updated.owner, 'player', 'spread should pause until Frontier Sweep is cleared');
}

testSpreadChanceScalesWithMisses();
testSpreadConvertsAdjacentPlayerTile();
testSpreadSkipsProtectedCamp();
testOverworldTickTriggersRebelSpread();
testTutorialCampIgnoresDailySpread();
testFrontierSweepGracePeriodBlocksSpread();
