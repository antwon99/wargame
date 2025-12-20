const assert = require('assert');
const ImperialMandates = require('../scripts/imperialMandates.js');

async function run() {
    ImperialMandates.resetForNewCampaign();
    global.window = {
        ImperialMandates,
        InputHelpers: { SQRT3: Math.sqrt(3) },
        IntroOverlay: { active: false, clearIntroSeenFlag: () => {}, reset: () => {} }
    };

    const { createGameCore } = await import('../scripts/game/core.js');
    const { Game, Hex } = createGameCore();

    // Use a deterministic RNG so starter tile selection remains predictable during the test.
    Game.random = () => 0.33;
    Game.updateSaveStatus = () => {};
    Game.showOverworldUI = () => {};
    Game.spawnTxt = () => {};
    Game.playSound = () => {};
    Game.showTileCallout = () => {};
    Game.hideTileCallout = () => {};
    await Game.bootstrapNewWorld();

    const mandateState = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    assert.strictEqual(mandateState.status, ImperialMandates.MandateStatus.ACTIVE, 'Frontier Sweep should start active.');

    const rebelTiles = Array.from(Game.overworld.hexes.values())
        .filter((tile) => tile?.isRebelCamp || tile?.type === 'rebelcamp');
    assert.ok(rebelTiles.length >= 1, 'A rebel camp must spawn at campaign start.');

    const starterKeys = new Set();
    for (let dir = 0; dir < 6; dir += 1) {
        starterKeys.add(Hex.neighbor(new Hex(0, 0), dir).toString());
    }

    starterKeys.forEach((key) => {
        const tile = Game.overworld.hexes.get(key);
        assert.ok(tile, 'Starter ring tiles should exist.');
        assert.notStrictEqual(tile.type, 'water', 'Starter ring should avoid water tiles.');
        assert.notStrictEqual(tile.isWater, true, 'Starter ring water metadata should be absent.');
    });

    delete global.window;
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
