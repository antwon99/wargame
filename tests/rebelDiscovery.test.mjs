import assert from 'assert';

function createContextStub() {
    return {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        clearRect: () => {},
        fillRect: () => {},
        translate: () => {},
        scale: () => {},
        arc: () => {},
        fillText: () => {},
        setTransform: () => {},
        measureText: () => ({ width: 0 })
    };
}

function createDocumentStub(ctx) {
    const canvas = { getContext: () => ctx, classList: { add: () => {}, remove: () => {} } };
    const fxLayer = { getContext: () => ctx, classList: { add: () => {}, remove: () => {} } };
    const elements = new Map([
        ['canvas', canvas],
        ['fx-layer', fxLayer],
        ['debug-log', { classList: { add: () => {} }, textContent: '' }],
        ['reclamation-hint', { classList: { add: () => {}, remove: () => {} } }],
        ['ui-overworld', { classList: { add: () => {}, remove: () => {} } }],
        ['ui-combat', { classList: { add: () => {}, remove: () => {} } }]
    ]);
    return {
        getElementById: (id) => elements.get(id) || { getContext: () => ctx, classList: { add: () => {}, remove: () => {} } },
        addEventListener: () => {},
        body: { appendChild: () => {} }
    };
}

function createWindowStub(document) {
    return {
        document,
        innerWidth: 1024,
        innerHeight: 768,
        devicePixelRatio: 1,
        addEventListener: () => {},
        requestAnimationFrame: (fn) => fn(0),
        cancelAnimationFrame: () => {},
        PlatformAdapter: undefined,
        InputHelpers: {
            SQRT3: Math.sqrt(3),
            Layout: { f0: Math.sqrt(3), f1: Math.sqrt(3) / 2, f2: 0, f3: 3 / 2, b0: Math.sqrt(3) / 3, b1: -1 / 3, b2: 0, b3: 2 / 3 }
        }
    };
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
        return fn();
    } finally {
        Math.random = originalRandom;
    }
}

async function buildGame() {
    const ctx = createContextStub();
    global.document = createDocumentStub(ctx);
    global.window = createWindowStub(global.document);
    global.window.IntroOverlay = { init: () => {} };

    const { createGameCore } = await import('../scripts/game/core.js');
    const { Game, Hex } = createGameCore({
        buildClusterBonusMap: () => new Map(),
        buildTileVisibilityMap: () => new Map()
    });

    Game.ctx = ctx;
    Game.viewport = { width: 1024, height: 768 };
    Game.spawnTxt = () => {};
    Game.playSound = () => {};
    Game.refreshClusterBonuses = () => { Game.clusterRefreshes = (Game.clusterRefreshes || 0) + 1; };

    const castle = new Hex(0, 0);
    Game.overworld.hexes = new Map([[castle.toString(), { hex: castle, type: 'castle', owner: 'player' }]]);
    return { Game, Hex };
}

async function testRebelCampDiscoveryHasChance() {
    const { Game, Hex } = await buildGame();
    const target = new Hex(1, 0, -1);

    // Floor the chance (~10%) and confirm a low roll still spawns rebels.
    withMockedRandom([0, 0.05], () => {
        const rebelTile = Game.claimHexLogic(target, false);
        const stored = Game.overworld.hexes.get(target.toString());
        assert.strictEqual(stored, rebelTile, 'claimHexLogic should return the rebel tile when spawned');
        assert.strictEqual(stored.owner, 'rebel', 'rebel discoveries should belong to rebels');
        assert.strictEqual(stored.type, 'rebelcamp', 'rebel discoveries should mark the camp type');
        assert.ok(stored.isRebelCamp, 'rebel camps should carry a discovery flag');
        assert.strictEqual(stored.prevType, 'field', 'rebel camps should remember the hidden terrain underneath');
        assert.ok(Game.clusterRefreshes >= 1, 'cluster bonuses should refresh after a rebel discovery');
    });
}

async function testFrontierClaimsDefaultToPlayerTiles() {
    const { Game, Hex } = await buildGame();
    const target = new Hex(1, -1, 0);

    withMockedRandom([0.2, 0.99, 0.01], () => {
        Game.claimHexLogic(target, false);
    });

    const stored = Game.overworld.hexes.get(target.toString());
    assert.strictEqual(stored.owner, 'player', 'standard claims should stay under player control');
    assert.ok(!stored.isRebelCamp, 'non-rebel claims should not be marked as rebel camps');
}

async function testFreeClaimsAvoidRebels() {
    const { Game, Hex } = await buildGame();
    const target = new Hex(2, 0, -2);

    withMockedRandom(0.01, () => {
        Game.claimHexLogic(target, true);
    });

    const stored = Game.overworld.hexes.get(target.toString());
    assert.strictEqual(stored.owner, 'player', 'free bootstrap claims should remain player-owned');
    assert.strictEqual(stored.type !== 'rebelcamp', true, 'free claims should not create rebel camps');
}

async function testFreeClaimsAvoidStartingWater() {
    const { Game, Hex } = await buildGame();
    const target = new Hex(2, -1, -1);

    // Force the weighted pick toward the former water slot and ensure starter claims reroll to land.
    withMockedRandom(0.995, () => {
        Game.claimHexLogic(target, true);
    });

    const stored = Game.overworld.hexes.get(target.toString());
    assert.notStrictEqual(stored.type, 'water', 'bootstrap claims should avoid water tiles');
    assert.strictEqual(Boolean(stored.isWater), false, 'starter territory should not be flagged as water');
}

async function testFrontierRebelCampAvoidsWaterTiles() {
    const RebelSystemModule = await import('../scripts/rebelSystem.js');
    const RebelSystem = RebelSystemModule.default || RebelSystemModule;
    class Hex {
        constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
        toString() { return `${this.q},${this.r}`; }
        static neighbor(hex, dir) {
            const dirs = [
                new Hex(1, 0, -1), new Hex(1, -1, 0), new Hex(0, -1, 1),
                new Hex(-1, 0, 1), new Hex(-1, 1, 0), new Hex(0, 1, -1)
            ];
            return new Hex(hex.q + dirs[dir].q, hex.r + dirs[dir].r, hex.s + dirs[dir].s);
        }
    }
    const origin = new Hex(0, 0, 0);
    const dryFrontier = new Hex(1, 0, -1);
    const wetFrontier = new Hex(0, 1, -1);
    const gameState = {
        Hex,
        overworld: {
            hexes: new Map([
                [origin.toString(), { hex: origin, type: 'castle', owner: 'player' }],
                [wetFrontier.toString(), { hex: wetFrontier, type: 'water', owner: 'player', isWater: true }],
                [dryFrontier.toString(), { hex: dryFrontier, type: 'field', owner: 'player' }]
            ])
        }
    };

    const rebelTile = RebelSystem.spawnRebelCampNearFrontier(gameState);
    const stored = gameState.overworld.hexes.get(rebelTile.hex.toString());
    assert.strictEqual(stored.type, 'rebelcamp', 'rebel mandate should convert a dry frontier tile');
    assert.strictEqual(Boolean(stored.isWater), false, 'rebel camps should not spawn on water tiles');
    assert.ok(gameState.overworld.hexes.get(wetFrontier.toString()).isWater, 'water tiles should remain untouched');
}

async function run() {
    await testRebelCampDiscoveryHasChance();
    await testFrontierClaimsDefaultToPlayerTiles();
    await testFreeClaimsAvoidRebels();
    await testFreeClaimsAvoidStartingWater();
    await testFrontierRebelCampAvoidsWaterTiles();
    console.log('Rebel discovery tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
