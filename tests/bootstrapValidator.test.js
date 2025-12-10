const assert = require('assert');

async function run() {
    const { validateBootstrapDependencies } = await import('../scripts/bootstrapValidator.mjs');

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
    assert.strictEqual(debugEl.textContent, '', 'debug log should remain untouched by validator');

    console.log('All bootstrap validator tests passed.');
}

run();
