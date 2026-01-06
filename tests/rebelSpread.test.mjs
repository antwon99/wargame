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

function testSpreadChanceScalesWithTime() {
    const baseChance = 0.05;
    const dailyGrowth = 0.01;
    const maxChance = 0.1;
    const earlyChance = RebelSystem.getRebelSpreadChance({}, {
        ticks: 3,
        baseChance,
        dailyGrowth,
        maxChance
    });
    const cappedChance = RebelSystem.getRebelSpreadChance({}, {
        ticks: 10,
        baseChance,
        dailyGrowth,
        maxChance
    });
    assert.strictEqual(earlyChance, 0.08, 'spread chance should scale linearly with ticks');
    assert.strictEqual(cappedChance, 0.1, 'spread chance should clamp to the max chance');
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

testSpreadChanceScalesWithTime();
testSpreadConvertsAdjacentPlayerTile();
testSpreadSkipsProtectedCamp();
testOverworldTickTriggersRebelSpread();
testTutorialCampIgnoresDailySpread();
