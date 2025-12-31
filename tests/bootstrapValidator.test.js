import assert from 'assert';

async function run() {
    const { validateBootstrapDependencies } = await import('../scripts/bootstrapValidator.js');

    const debugEl = { classList: { add: () => {} }, textContent: '' };
    const result = validateBootstrapDependencies({
        researchSystem: null,
        persistence: null,
        inputHelpers: null,
        canvas: null,
        ctx: null,
        debugEl
    });

    assert.ok(!result.researchSystemAvailable, 'ResearchSystem should be flagged as missing');
    assert.ok(!result.persistenceAvailable, 'Persistence should be flagged as missing');
    assert.ok(!result.inputHelpersAvailable, 'InputHelpers should be flagged as missing');
    assert.ok(result.missingHelpers.some(h => h.includes('ResearchSystem')), 'missingHelpers should call out tech tree dependency');
    assert.ok(debugEl.textContent.includes('Missing helpers'), 'debug log should include a descriptive error');

    console.log('All bootstrap validator tests passed.');
}

run();
