import assert from 'assert';

async function testHydratesAfterToggle() {
    const originalWindow = globalThis.window;
    globalThis.window = { DebugToggles: { audioDebugBus: false } };

    const { AudioDebugBus, hydrateDebugBus } = await import('../scripts/audio/debugBus.js?test=hydrate-toggle');

    assert.strictEqual(AudioDebugBus.enabled, false, 'debug bus should start disabled without toggles');

    globalThis.window.DebugToggles.audioDebugBus = true;
    await hydrateDebugBus();

    assert.strictEqual(AudioDebugBus.enabled, true, 'hydrateDebugBus should enable the debug bus after toggles flip');
    assert.strictEqual(globalThis.window.AudioDebugBus, AudioDebugBus, 'hydrated debug bus should be registered globally');

    const snapshot = AudioDebugBus.snapshot();
    assert.ok(Array.isArray(snapshot.activeSources), 'hydrated debug bus should return active source arrays');

    if (originalWindow === undefined) {
        delete globalThis.window;
    } else {
        globalThis.window = originalWindow;
    }
}

async function run() {
    await testHydratesAfterToggle();
    console.log('Audio debug bus hydration test passed.');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
