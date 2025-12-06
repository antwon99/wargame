const assert = require('assert');

async function run() {
    const { FOG_VISUAL_CONFIG, resolveFogInnerOpacity } = await import('../scripts/fogVisualConfig.mjs');

    const defaultOpacity = resolveFogInnerOpacity();
    assert.strictEqual(defaultOpacity, FOG_VISUAL_CONFIG.coreInnerOpacity, 'default opacity should reflect config baseline');

    const unaffectedByCluster = resolveFogInnerOpacity({ clusterIntensity: 0.9 });
    assert.strictEqual(
        unaffectedByCluster,
        FOG_VISUAL_CONFIG.coreInnerOpacity,
        'inner opacity should not change when only cluster intensity shifts'
    );

    const customizedOpacity = resolveFogInnerOpacity({ coreInnerOpacity: 0.42, clusterIntensity: 0.9 });
    assert.strictEqual(customizedOpacity, 0.42, 'coreInnerOpacity override should take precedence over cluster intensity');

    console.log('Fog visual config tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
