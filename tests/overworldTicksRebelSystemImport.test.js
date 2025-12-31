import assert from 'assert';
import { applyOverworldIncome } from '../scripts/overworldTicks.js';

class Hex {
    constructor(q, r, s = -q - r) {
        this.q = q;
        this.r = r;
        this.s = s;
    }
    toString() {
        return `${this.q},${this.r}`;
    }
}

function buildGameState() {
    const gameState = {
        Hex,
        gold: 0,
        wood: 0,
        overworld: { hexes: new Map(), tickRate: 1, timer: 0 },
        research: { bonuses: {} },
        timekeeper: { advance: () => {} },
        updateHUD: () => {},
        updateUpgradeMenu: () => {}
    };

    const townHex = new Hex(0, 0);
    const rebelHex = new Hex(1, 0);

    gameState.overworld.hexes.set(townHex.toString(), { hex: townHex, type: 'town', owner: 'player' });
    gameState.overworld.hexes.set(rebelHex.toString(), { hex: rebelHex, type: 'rebelcamp', owner: 'rebel' });

    return gameState;
}

function testOverworldTicksIgnoreGlobalRebelSystemFallback() {
    const originalRebelSystem = globalThis.RebelSystem;
    globalThis.RebelSystem = {
        isRebelCampTile: () => {
            throw new Error('global RebelSystem fallback used');
        }
    };

    try {
        const gameState = buildGameState();
        assert.doesNotThrow(() => applyOverworldIncome(gameState));
        assert.strictEqual(gameState.gold, 3, 'town income should apply while rebel camps are skipped');
    } finally {
        if (originalRebelSystem === undefined) {
            delete globalThis.RebelSystem;
        } else {
            globalThis.RebelSystem = originalRebelSystem;
        }
    }
}

testOverworldTicksIgnoreGlobalRebelSystemFallback();
