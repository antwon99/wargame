import assert from 'assert';
import { createGameCore } from '../scripts/game/core.js';

function run() {
    const { Game } = createGameCore();

    return import('../scripts/snowVisualConfig.js')
        .then((snowModule) => {
            const originalOpacity = snowModule.SNOW_VISUAL_CONFIG.maxOpacity;
            snowModule.SNOW_VISUAL_CONFIG.maxOpacity = 0.15;

            return new Promise((resolve) => setImmediate(resolve))
                .then(() => {
                    Game.applyFeatureOverrides();
                    assert.strictEqual(
                        Game.featureToggles.snow.maxOpacity,
                        0.15,
                        'Snow overrides should use the latest snow visual config after the module resolves.'
                    );
                    console.log('Snow visual config lazy import update test passed.');
                })
                .finally(() => {
                    snowModule.SNOW_VISUAL_CONFIG.maxOpacity = originalOpacity;
                });
        });
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
