import assert from 'assert';

async function run() {
    const {
        buildCoreResourceState,
        buildFeatureToggles,
        createGameCore
    } = await import('../scripts/game/core.js');

    // createGameCore should not touch the DOM until init is invoked.
    global.document = { getElementById: () => { throw new Error('DOM access should be deferred until init'); } };
    const { Game } = createGameCore();
    assert.strictEqual(Game.canvas, null, 'Canvas binding should be null before init.');
    assert.strictEqual(Game.ctx, null, 'Context binding should be null before init.');
    assert.strictEqual(Game.fxLayer, null, 'FX layer should be null before init.');
    delete global.document;

    const fallbackStats = { bestLevel: 1, bestKills: 2, totalKills: 3, warsWon: 5, warsFought: 4, lastOutcome: 'N/A', lastSaveISO: null };
    const resources = buildCoreResourceState({ fallbackStats });
    resources.stats.bestLevel = 99;
    const pristineResources = buildCoreResourceState({ fallbackStats });
    assert.strictEqual(pristineResources.stats.bestLevel, fallbackStats.bestLevel, 'Factory should clone fallback stats.');
    resources.factionState.standings.crown = 10;
    const pristineFactionState = buildCoreResourceState({ fallbackStats }).factionState;
    assert.strictEqual(pristineFactionState.standings.crown, 50, 'Factory should seed neutral faction standings.');

    const snowDefaults = { enabled: true, maxOpacity: 0.5 };
    const toggles = buildFeatureToggles({ snowDefaults });
    toggles.snow.enabled = false;
    const freshToggles = buildFeatureToggles({ snowDefaults });
    assert.strictEqual(freshToggles.snow.enabled, true, 'Feature toggles should clone snow defaults.');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
