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
        buildTileVisibilityMap: () => new Map(),
        dependencies: {
            inputHelpers: global.window.InputHelpers,
            introOverlay: global.window.IntroOverlay
        }
    });

    Game.ctx = ctx;
    Game.viewport = { width: 1024, height: 768 };
    Game.spawnTxt = () => {};
    Game.playSound = () => {};
    Game.refreshClusterBonuses = () => { Game.clusterRefreshes = (Game.clusterRefreshes || 0) + 1; };
    Game.narrativeEvents = [];
    Game.narrative = {
        emit: (eventType, payload) => {
            Game.narrativeEvents.push({ eventType, payload });
        }
    };

    const castle = new Hex(0, 0);
    Game.overworld.hexes = new Map([[castle.toString(), { hex: castle, type: 'castle', owner: 'player' }]]);
    return { Game, Hex };
}

async function testRebelCampDiscoveryHasChance() {
    const { Game, Hex } = await buildGame();
    const target = new Hex(1, 0, -1);
    Game.timekeeper.ticks = 123;

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

    const narrativeEvent = Game.narrativeEvents.find((event) => event.eventType === 'rebel_camp_spawned');
    assert.ok(narrativeEvent, 'rebel camp discovery should emit a narrative event');
    assert.strictEqual(narrativeEvent.payload?.hex?.toString?.(), target.toString(), 'narrative payload should include the rebel location');
    assert.strictEqual(narrativeEvent.payload?.tick, 123, 'narrative payload should include the current tick');
}

async function testFrontierSweepBlocksRebelDiscovery() {
    const { Game, Hex } = await buildGame();
    const target = new Hex(1, 0, -1);
    Game.tutorial = {
        frontierSweep: {
            targetTileKey: '0,0',
            completionTick: null,
            spreadImmune: true
        }
    };

    withMockedRandom([0, 0.01], () => {
        Game.claimHexLogic(target, false);
    });

    const stored = Game.overworld.hexes.get(target.toString());
    assert.strictEqual(stored.owner, 'player', 'Frontier Sweep should block new rebel discoveries');
    assert.ok(!stored.isRebelCamp, 'blocked discoveries should remain non-rebel tiles');
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

async function testSpecialTileClaimEmitsNarrative() {
    const { Game, Hex } = await buildGame();
    const target = new Hex(2, -1, -1);

    Game.narrativeEvents = [];
    withMockedRandom([0.2, 0.99, 0.7], () => {
        Game.claimHexLogic(target, false);
    });

    const narrativeEvent = Game.narrativeEvents.find((event) => event.eventType === 'tile_claimed');
    assert.ok(narrativeEvent, 'special tile claims should emit narrative events');
    assert.strictEqual(narrativeEvent.payload?.tileType, 'town', 'payload should include the claimed tile type');
    assert.strictEqual(narrativeEvent.payload?.free, false, 'payload should include the free flag');
    assert.strictEqual(narrativeEvent.payload?.hex?.toString?.(), target.toString(), 'payload should include the claimed hex');
}

async function run() {
    await testRebelCampDiscoveryHasChance();
    await testFrontierSweepBlocksRebelDiscovery();
    await testFrontierClaimsDefaultToPlayerTiles();
    await testFreeClaimsAvoidRebels();
    await testSpecialTileClaimEmitsNarrative();
    console.log('Rebel discovery tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
