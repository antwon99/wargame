import assert from 'assert';
import { updateCombat } from '../scripts/combatEngine.js';
import { buildUltimatesState } from '../scripts/game/state.js';
import { DEFAULT_ULTIMATE_LEVELS, resolveUltimateLevelValue, ULTIMATE_CONFIG } from '../scripts/game/ultimatesConfig.js';

class Hex {
    constructor(q, r, s = -q - r) {
        this.q = q;
        this.r = r;
        this.s = s;
    }

    toString() { return `${this.q},${this.r}`; }

    static round(hex) {
        return new Hex(Math.round(hex.q), Math.round(hex.r), Math.round(hex.s));
    }

    static distance(a, b) {
        return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
    }
}

function buildBaseGame() {
    const origin = new Hex(0, 0);
    return {
        Hex,
        gold: 0,
        combat: {
            warElapsedMs: 0,
            warStartMs: Date.now(),
            territory: new Map([[origin.toString(), { owner: 'player', hex: origin }]]),
            buildings: new Map(),
            units: [],
            fx: [],
            ai: { timer: 0, nextMove: 999 }
        },
        parseKey: (key) => {
            const [q, r] = key.split(',').map(Number);
            return new Hex(q, r);
        },
        spawnTxt: () => {},
        playSound: () => {},
        updateHUD: () => {}
    };
}

function testRushSpeedMultiplierAffectsMovementOnlyWhileActive() {
    const baseGame = buildBaseGame();
    const inactiveRushGame = buildBaseGame();
    const rushGame = buildBaseGame();
    baseGame.combat.units.push({
        type: 'soldier',
        owner: 'player',
        hp: 100,
        dmg: 10,
        range: 1,
        speed: 1,
        cooldown: 0,
        pos: new Hex(0, 0)
    });
    inactiveRushGame.combat.units.push({
        type: 'soldier',
        owner: 'player',
        hp: 100,
        dmg: 10,
        range: 1,
        speed: 1,
        cooldown: 0,
        pos: new Hex(0, 0)
    });
    rushGame.combat.units.push({
        type: 'soldier',
        owner: 'player',
        hp: 100,
        dmg: 10,
        range: 1,
        speed: 1,
        cooldown: 0,
        pos: new Hex(0, 0)
    });
    inactiveRushGame.combat.ultimates = buildUltimatesState();
    rushGame.combat.ultimates = buildUltimatesState();
    rushGame.combat.ultimates.activeEffects.rush = { speedMultiplier: 2 };

    updateCombat(baseGame, 1);
    updateCombat(inactiveRushGame, 1);
    updateCombat(rushGame, 1);

    assert.ok(
        Math.abs(rushGame.combat.units[0].pos.r) > Math.abs(baseGame.combat.units[0].pos.r),
        'Rush should increase player unit movement speed'
    );
    assert.strictEqual(
        Math.abs(inactiveRushGame.combat.units[0].pos.r),
        Math.abs(baseGame.combat.units[0].pos.r),
        'Rush should not affect movement when the ultimate is inactive'
    );
}

function testManpowerAdjustsSpawnRateAndDoubleSpawnsOnlyWhileActive() {
    const baseGame = buildBaseGame();
    const manpowerGame = buildBaseGame();
    const inactiveGame = buildBaseGame();
    const barracks = {
        type: 'barracks',
        owner: 'player',
        hp: 500,
        prodTimer: 2.4,
        attackTimer: 0,
        pulse: 0
    };
    baseGame.combat.buildings.set('0,0', { ...barracks });
    inactiveGame.combat.buildings.set('0,0', { ...barracks });
    manpowerGame.combat.buildings.set('0,0', {
        type: 'barracks',
        owner: 'player',
        hp: 500,
        prodTimer: 2.4,
        attackTimer: 0,
        pulse: 0
    });
    manpowerGame.combat.ultimates = buildUltimatesState();
    manpowerGame.combat.ultimates.activeEffects.manpower = { spawnRateMultiplier: 0.5, doubleSpawnChance: 1 };
    inactiveGame.combat.ultimates = buildUltimatesState();

    const originalRandom = Math.random;
    Math.random = () => 0;
    updateCombat(baseGame, 0.2);
    updateCombat(inactiveGame, 0.2);
    updateCombat(manpowerGame, 0.2);
    Math.random = originalRandom;

    assert.strictEqual(
        baseGame.combat.units.length,
        0,
        'Spawn rate should stay unchanged when manpower is inactive'
    );
    assert.strictEqual(
        inactiveGame.combat.units.length,
        0,
        'Inactive manpower should not accelerate spawn timing'
    );
    assert.strictEqual(
        manpowerGame.combat.units.length,
        2,
        'Manpower should allow a double spawn when the chance roll succeeds'
    );

    const manpowerBarracks = manpowerGame.combat.buildings.get('0,0');
    manpowerGame.combat.ultimates.activeEffects = {};
    manpowerGame.combat.units = [];
    manpowerBarracks.prodTimer = 5;
    const originalRandomSecond = Math.random;
    Math.random = () => 0;
    updateCombat(manpowerGame, 0);
    Math.random = originalRandomSecond;
    assert.strictEqual(
        manpowerGame.combat.units.length,
        1,
        'Manpower should not double-spawn once the ultimate effect ends'
    );
}

function testGoldUltimateCullsUnitsOnce() {
    const goldGame = buildBaseGame();
    goldGame.gold = 0;
    goldGame.combat.warElapsedMs = 30000;
    goldGame.combat.units = [
        { type: 'soldier', owner: 'player', hp: 100, dmg: 10, range: 1, speed: 1, cooldown: 0, pos: new Hex(0, 0) },
        { type: 'soldier', owner: 'player', hp: 100, dmg: 10, range: 1, speed: 1, cooldown: 0, pos: new Hex(0, 0) },
        { type: 'soldier', owner: 'player', hp: 100, dmg: 10, range: 1, speed: 1, cooldown: 0, pos: new Hex(0, 0) },
        { type: 'soldier', owner: 'player', hp: 100, dmg: 10, range: 1, speed: 1, cooldown: 0, pos: new Hex(0, 0) },
        { type: 'soldier', owner: 'enemy', hp: 100, dmg: 10, range: 1, speed: 1, cooldown: 0, pos: new Hex(0, 0) }
    ];
    goldGame.combat.ultimates = buildUltimatesState();
    goldGame.combat.ultimates.activeEffects.gold = { activatedAtMs: 0 };

    const expectedCull = Math.floor(4 * resolveUltimateLevelValue(
        ULTIMATE_CONFIG.gold.unitCullPercent,
        DEFAULT_ULTIMATE_LEVELS.gold
    ));
    const expectedGold = expectedCull * resolveUltimateLevelValue(
        ULTIMATE_CONFIG.gold.goldPerUnit,
        DEFAULT_ULTIMATE_LEVELS.gold
    );

    updateCombat(goldGame, 0);
    const unitsAfterFirst = goldGame.combat.units.filter((unit) => unit.owner === 'player').length;
    const goldAfterFirst = goldGame.gold;

    updateCombat(goldGame, 0);

    assert.strictEqual(unitsAfterFirst, 4 - expectedCull, 'Gold ultimate should cull the expected number of units');
    assert.strictEqual(goldAfterFirst, expectedGold, 'Gold ultimate should grant gold per culled unit');
    assert.strictEqual(
        goldGame.combat.units.filter((unit) => unit.owner === 'player').length,
        unitsAfterFirst,
        'Gold ultimate should only apply once per battle'
    );
    assert.strictEqual(goldGame.gold, goldAfterFirst, 'Gold ultimate should not re-grant gold after consumption');
}

function run() {
    testRushSpeedMultiplierAffectsMovementOnlyWhileActive();
    testManpowerAdjustsSpawnRateAndDoubleSpawnsOnlyWhileActive();
    testGoldUltimateCullsUnitsOnce();
    console.log('Combat ultimate effect tests passed.');
}

run();
