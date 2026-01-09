import assert from 'assert';
import { createGameCore } from '../scripts/game/core.js';

function resolvePaintPosition(game, hex, Layout) {
    const layout = { origin: game.cam, size: 30 * game.cam.zoom, ...Layout };
    return hex.toPixel(layout);
}

async function testPaintClaimSpendsOnce() {
    const { Game, Hex, Layout } = createGameCore({ dependencies: { persistence: null } });
    Game.state = 'OVERWORLD';
    Game.wood = 20;
    Game.overworld.claimable = new Map();

    const target = new Hex(0, 0);
    const key = target.toString();
    Game.overworld.claimable.set(key, 10);

    let claimCalls = 0;
    Game.claimHexLogic = () => {
        claimCalls += 1;
        Game.overworld.claimable.delete(key);
    };
    Game.calcOverworldGhosts = () => {};

    const pos = resolvePaintPosition(Game, target, Layout);
    Game.setPaintClaimMode(true);
    Game.onPaint(pos.x, pos.y);
    Game.onPaint(pos.x, pos.y);

    assert.strictEqual(Game.wood, 10, 'paint claim should deduct wood once per tile');
    assert.strictEqual(claimCalls, 1, 'paint claim should only claim each tile once per drag');
    assert.ok(Game.paintClaimStatus.includes('Painted frontier'), 'status should report paint spend');
}

async function testPaintClaimBlocksWhenInsufficientWood() {
    const { Game, Hex, Layout } = createGameCore({ dependencies: { persistence: null } });
    Game.state = 'OVERWORLD';
    Game.wood = 2;
    Game.overworld.claimable = new Map();

    const target = new Hex(0, 0);
    const key = target.toString();
    Game.overworld.claimable.set(key, 10);

    let claimCalls = 0;
    Game.claimHexLogic = () => {
        claimCalls += 1;
    };

    const pos = resolvePaintPosition(Game, target, Layout);
    Game.setPaintClaimMode(true);
    Game.onPaint(pos.x, pos.y);

    assert.strictEqual(Game.wood, 2, 'paint claim should not spend wood when insufficient');
    assert.strictEqual(claimCalls, 0, 'paint claim should not claim when unaffordable');
    assert.ok(Game.paintClaimStatus.includes('Need'), 'status should report missing wood');
}

async function testPaintClaimSettingsPreferenceRestoresAfterCombat() {
    const { Game } = createGameCore({ dependencies: { persistence: null } });
    Game.settingsService = {
        getSnapshot: () => ({ general: { paintToClaim: true } })
    };

    Game.state = 'COMBAT';
    Game.setPaintClaimMode(true);
    Game.isPaintClaimModeActive();
    assert.strictEqual(Game.paintClaimMode, false, 'paint-claim should disable during combat even when enabled');

    Game.state = 'OVERWORLD';
    Game.isPaintClaimModeActive();
    assert.strictEqual(Game.paintClaimMode, true, 'paint-claim should re-enable in overworld when enabled');
}

async function run() {
    await testPaintClaimSpendsOnce();
    await testPaintClaimBlocksWhenInsufficientWood();
    await testPaintClaimSettingsPreferenceRestoresAfterCombat();
    console.log('Paint claim mode tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
