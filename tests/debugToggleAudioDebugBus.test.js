import assert from 'assert';
import { createStubDocument } from './helpers/domStubs.js';

function flushPromises() {
    return new Promise((resolve) => setImmediate(resolve));
}

async function testDebugPanelHydratesAudioBus() {
    const originalWindow = globalThis.window;
    const doc = createStubDocument();
    doc.addEventListener = () => {};
    doc.register('audio-debug');
    doc.register('debug-log', { classList: { add() {}, remove() {}, contains() {}, toggle() {} }, textContent: '' });

    const target = { document: doc };
    globalThis.window = target;

    const debugToggleModule = await import('../scripts/debugToggle.js?test=audio-bus-toggle');
    const audioModule = await import('../scripts/audio.js');
    const { AudioDebugBus } = await import('../scripts/audio/debugBus.js');

    audioModule.GameAudio.play('victory');
    await flushPromises();

    debugToggleModule.initDebugToggle(target, { document: doc });
    await debugToggleModule.setDebugVisibility(true, doc);

    assert.strictEqual(target.DebugToggles.audioDebugBus, true, 'debug panel should enable the audio debug bus toggle');
    assert.strictEqual(AudioDebugBus.enabled, true, 'debug panel should hydrate the audio debug bus on demand');
    const snapshot = AudioDebugBus.snapshot();
    assert.ok(
        snapshot.activeSources.some((source) => source.key === 'victory'),
        'debug bus should backfill already-playing nodes'
    );

    if (originalWindow === undefined) {
        delete globalThis.window;
    } else {
        globalThis.window = originalWindow;
    }
}

async function run() {
    await testDebugPanelHydratesAudioBus();
    console.log('Debug panel audio bus hydration test passed.');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
