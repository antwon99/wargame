const assert = require('assert');

async function run() {
    const {
        attachFogParallaxDebugControls,
        FOG_VISUAL_CONFIG,
        resolveFogInnerOpacity,
        resolveFogParallax
    } = await import('../scripts/fogVisualConfig.mjs');

    const originalParallax = resolveFogParallax();

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

    const parallaxDefaults = resolveFogParallax();
    assert.deepStrictEqual(
        parallaxDefaults,
        originalParallax,
        'parallax defaults should come directly from FOG_VISUAL_CONFIG'
    );

    const parallaxOverride = resolveFogParallax({ parallaxSpeed: originalParallax.parallaxSpeed * 2 });
    assert.strictEqual(
        parallaxOverride.parallaxSpeed,
        originalParallax.parallaxSpeed * 2,
        'parallax overrides should update the speed while keeping amplitude intact'
    );
    assert.strictEqual(
        parallaxOverride.parallaxAmplitude,
        originalParallax.parallaxAmplitude,
        'parallax override should fall back to config amplitude when omitted'
    );

    const debugHarness = {};
    const parallaxTuning = attachFogParallaxDebugControls(debugHarness);
    assert.ok(parallaxTuning, 'debug controls should attach when a target is provided');

    parallaxTuning.setSpeed(0.5);
    parallaxTuning.setAmplitude(40);
    assert.strictEqual(FOG_VISUAL_CONFIG.parallaxSpeed, 0.5, 'runtime speed tuning should persist to config');
    assert.strictEqual(FOG_VISUAL_CONFIG.parallaxAmplitude, 40, 'runtime amplitude tuning should persist to config');
    assert.deepStrictEqual(
        debugHarness.FogParallaxTuning.getValues(),
        resolveFogParallax(),
        'exposed API should reflect config-backed parallax values'
    );

    // Restore parallax config to protect downstream tests.
    parallaxTuning.setSpeed(originalParallax.parallaxSpeed);
    parallaxTuning.setAmplitude(originalParallax.parallaxAmplitude);

    console.log('Fog visual config tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
