const assert = require('assert');

async function run() {
    const {
        FOG_VISUAL_CONFIG,
        FOG_VISUAL_MODES,
        resolveFogInnerOpacity,
        resolveFogParallax,
        resolveFogVisualConfig
    } = await import('../scripts/fogVisualConfig.mjs');

    const originalParallax = resolveFogParallax();

    const defaultOpacity = resolveFogInnerOpacity();
    assert.strictEqual(defaultOpacity, FOG_VISUAL_CONFIG.coreInnerOpacity, 'default opacity should reflect config baseline');

    assert.strictEqual(
        FOG_VISUAL_CONFIG.visualMode,
        FOG_VISUAL_MODES.VOID,
        'default visual mode should keep the void-only baseline'
    );
    const seasonalMode = resolveFogVisualConfig({ visualMode: FOG_VISUAL_MODES.SEASONAL_SNOW });
    assert.strictEqual(
        seasonalMode.visualMode,
        FOG_VISUAL_MODES.SEASONAL_SNOW,
        'seasonal/snow experimentation should require an explicit opt-in mode'
    );
    const fallbackMode = resolveFogVisualConfig({ visualMode: 'anything-else' });
    assert.strictEqual(
        fallbackMode.visualMode,
        FOG_VISUAL_MODES.VOID,
        'invalid visual modes should fall back to the void baseline'
    );

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

    assert.doesNotThrow(() => resolveFogVisualConfig(), 'default resolution should not throw on undefined config');

    const sanitizedFogConfig = resolveFogVisualConfig({
        coreInnerOpacity: -0.5,
        rippleOpacity: 1.5,
        fogGradientStops: null,
        rippleGradientStops: undefined,
        spotlightColors: undefined
    });
    assert.strictEqual(
        sanitizedFogConfig.coreInnerOpacity,
        resolveFogInnerOpacity({ coreInnerOpacity: -0.5 }),
        'core opacity should clamp to a non-zero floor'
    );
    assert.strictEqual(sanitizedFogConfig.rippleOpacity, 1, 'ripple opacity should clamp to 1 when exceeding range');
    assert.strictEqual(
        sanitizedFogConfig.fogGradientStops,
        FOG_VISUAL_CONFIG.fogGradientStops,
        'missing gradient stops should fall back to defaults to avoid dereferencing errors'
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

    console.log('Fog visual config tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
