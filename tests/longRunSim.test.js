import assert from 'assert';
import { deriveAIPrep } from '../scripts/combatEngine.js';

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

async function testEconomyOverMultipleMonths() {
    const { applyOverworldIncome } = await import('../scripts/overworldTicks.js');
    const { Timekeeper } = await import('../scripts/timekeeper.js');

    const game = {
        gold: 0,
        wood: 0,
        imperialFavor: 5,
        Hex,
        timekeeper: new Timekeeper({ startTick: 0 }),
        overworld: { hexes: new Map(), clusterBonuses: new Map() },
        research: { bonuses: {} },
        spawnTxt: () => {},
        playSound: () => {},
        updateHUD: () => {},
        updateUpgradeMenu: () => {}
    };

    const tiles = [
        { hex: new Hex(0, 0), type: 'castle', owner: 'player' },
        { hex: new Hex(1, 0), type: 'town', owner: 'player' },
        { hex: new Hex(0, 1), type: 'forest', owner: 'player' },
        { hex: new Hex(-1, 0), type: 'mine', owner: 'player' }
    ];
    tiles.forEach((tile) => game.overworld.hexes.set(tile.hex.toString(), tile));

    for (let i = 0; i < 84; i += 1) {
        applyOverworldIncome(game);
    }

    assert.strictEqual(game.timekeeper.getCalendar().month, 4, 'calendar should advance three full months');
    assert.strictEqual(game.gold, 840, 'gold income should compound across shortened months');
    assert.strictEqual(game.wood, 252, 'wood income should keep pace with tougher prices');
}

function testAIPrepScaling() {
    const early = deriveAIPrep({ stats: { warsWon: 0 }, timekeeper: { getCalendar: () => ({ month: 1 }) } });
    const late = deriveAIPrep({ stats: { warsWon: 3 }, timekeeper: { getCalendar: () => ({ month: 9 }) } });

    assert.ok(late.gold > early.gold, 'AI gold should rise with campaign age and level');
    assert.ok(late.nextMove < early.nextMove, 'AI cadence should quicken over time');
}

async function run() {
    await testEconomyOverMultipleMonths();
    testAIPrepScaling();
    console.log('Long-run simulation tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
