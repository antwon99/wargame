import assert from 'assert';
import { updateCombat } from '../scripts/combatEngine.js';

class Hex {
    constructor(q, r, s = -q - r) {
        this.q = q;
        this.r = r;
        this.s = s;
    }

    toString() { return `${this.q},${this.r}`; }
    equals(other) { return other && this.q === other.q && this.r === other.r && this.s === other.s; }

    static round(hex) {
        return new Hex(Math.round(hex.q), Math.round(hex.r), Math.round(hex.s));
    }

    static distance(a, b) {
        return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
    }
}

function buildGame() {
    const origin = new Hex(0, 0);
    const territory = new Map([[origin.toString(), { owner: 'player', hex: origin }]]);
    const building = {
        type: 'tower',
        owner: 'player',
        hp: 100,
        prodTimer: 0.25,
        attackTimer: 0.5,
        pulse: 0
    };
    const unit = {
        type: 'soldier',
        owner: 'player',
        hp: 100,
        dmg: 10,
        range: 1,
        speed: 1,
        cooldown: 0.75,
        pos: new Hex(0, 0)
    };

    return {
        Hex,
        gold: 0,
        combat: {
            warElapsedMs: 1000,
            warStartMs: Date.now(),
            territory,
            buildings: new Map([[origin.toString(), building]]),
            units: [unit],
            fx: [],
            ai: { timer: 1.5, nextMove: 3.0 }
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

function assertFiniteState(game, initial) {
    assert.ok(Number.isFinite(game.combat.warElapsedMs), 'war elapsed ms should remain finite');
    assert.ok(Number.isFinite(game.combat.ai.timer), 'ai timer should remain finite');
    assert.ok(Number.isFinite(game.combat.buildings.get(initial.buildingKey).prodTimer), 'prod timer should remain finite');
    assert.ok(Number.isFinite(game.combat.buildings.get(initial.buildingKey).attackTimer), 'attack timer should remain finite');
    assert.ok(Number.isFinite(game.combat.units[0].cooldown), 'unit cooldown should remain finite');
    assert.ok(Number.isFinite(game.combat.units[0].pos.q), 'unit position should remain finite');
}

function assertStateUnchanged(game, initial) {
    const building = game.combat.buildings.get(initial.buildingKey);
    const unit = game.combat.units[0];
    assert.ok(game.combat.warElapsedMs >= initial.warElapsedMs, 'war elapsed ms should not decrease');
    assert.ok(game.combat.ai.timer >= initial.aiTimer, 'ai timer should not decrease');
    assert.ok(building.prodTimer >= initial.prodTimer, 'production timer should not decrease');
    assert.ok(building.attackTimer >= initial.attackTimer, 'attack timer should not decrease');
    assert.strictEqual(unit.cooldown, initial.cooldown, 'unit cooldown should remain unchanged for safe dt');
    assert.deepStrictEqual(
        { q: unit.pos.q, r: unit.pos.r, s: unit.pos.s },
        initial.pos,
        'unit position should remain unchanged for safe dt'
    );
}

function snapshotState(game) {
    const buildingKey = Array.from(game.combat.buildings.keys())[0];
    const building = game.combat.buildings.get(buildingKey);
    return {
        buildingKey,
        warElapsedMs: game.combat.warElapsedMs,
        aiTimer: game.combat.ai.timer,
        prodTimer: building.prodTimer,
        attackTimer: building.attackTimer,
        cooldown: game.combat.units[0].cooldown,
        pos: { ...game.combat.units[0].pos }
    };
}

function testSafeDtGuardsTimers() {
    const cases = [
        { label: 'NaN', dt: Number.NaN },
        { label: 'undefined', dt: undefined },
        { label: 'negative', dt: -1.25 }
    ];

    cases.forEach(({ label, dt }) => {
        const game = buildGame();
        const initial = snapshotState(game);
        updateCombat(game, dt);
        assertFiniteState(game, initial);
        assertStateUnchanged(game, initial);
        assert.ok(Number.isFinite(game.combat.warElapsedMs), `${label}: elapsed ms should be finite`);
    });
}

function run() {
    testSafeDtGuardsTimers();
    console.log('Combat engine safe dt regression tests passed.');
}

run();
