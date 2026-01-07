import assert from 'assert';

async function run() {
    const { validateBootstrapDependencies } = await import('../scripts/bootstrapValidator.js');
    const { BOOT_PHASES, registerBootDependencies, setBootPhase } = await import('../scripts/bootManager.js');

    let bootErrorMessage = '';
    const bootOverlay = {
        setError: message => {
            bootErrorMessage = message;
        }
    };
    const classNames = new Set();
    const debugEl = {
        classList: {
            add: name => classNames.add(name),
            remove: name => classNames.delete(name)
        },
        textContent: ''
    };
    registerBootDependencies({ bootOverlay, debugEl });
    setBootPhase(BOOT_PHASES.LOADING);
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
    assert.ok(bootErrorMessage.includes('Loading failed'), 'boot overlay should surface a loading failure');
    assert.ok(!classNames.has('visible'), 'debug log should stay hidden during the boot overlay');

    setBootPhase(BOOT_PHASES.READY);
    assert.ok(classNames.has('visible'), 'debug log should surface once the boot phase reaches READY');
    assert.ok(debugEl.textContent.includes('Missing helpers'), 'debug log should include a descriptive error');

    console.log('All bootstrap validator tests passed.');
}

run();
