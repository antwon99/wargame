import assert from 'assert';

async function run() {
    const { SNOW_MONTHS, SNOW_VISUAL_CONFIG, resolveSnowSeason, resolveSnowVisualConfig } = await import('../scripts/snowVisualConfig.js');

    const offSeason = resolveSnowSeason(new Date('2024-06-15T00:00:00Z'));
    assert.strictEqual(offSeason.inSeason, false, 'summer months should not trigger snow');
    assert.strictEqual(offSeason.progress, 0, 'off-season progress should be zero');

    const januarySeason = resolveSnowSeason(new Date('2024-01-10T00:00:00Z'));
    assert.strictEqual(januarySeason.inSeason, true, 'winter months should enable snow season');
    assert.ok(januarySeason.progress > 0.6, 'mid-winter should report high progress');

    const defaultConfig = resolveSnowVisualConfig({ currentDate: new Date('2024-11-05T00:00:00Z') });
    assert.strictEqual(defaultConfig.enabled, true, 'snow overlay should be enabled in season by default');
    assert.ok(
        defaultConfig.coverage >= SNOW_VISUAL_CONFIG.minCoverage
        && defaultConfig.coverage <= SNOW_VISUAL_CONFIG.maxCoverage,
        'coverage should stay within configured bounds'
    );

    const seasonStart = resolveSnowVisualConfig({ currentDate: new Date('2024-10-01T00:00:00Z') });
    assert.strictEqual(seasonStart.coverage, 0, 'season should start with no snow coverage');

    const disabledConfig = resolveSnowVisualConfig({ enabled: false, currentDate: new Date('2024-12-01T00:00:00Z') });
    assert.strictEqual(disabledConfig.enabled, false, 'explicit opt-out should disable snow even in winter');
    assert.strictEqual(disabledConfig.coverage, 0, 'disabled snow should not apply coverage');

    assert.ok(SNOW_MONTHS.includes(9) && SNOW_MONTHS.includes(2), 'snow months should span October through March');

    console.log('Snow visual config tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
