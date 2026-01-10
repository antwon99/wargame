import assert from 'assert';
import { createStubDocument } from './helpers/domStubs.js';

async function testDebugPanelHydratesAudioBus() {
    const originalWindow = globalThis.window;
    const doc = createStubDocument();
    doc.addEventListener = () => {};
    doc.register('audio-debug');
    doc.register('debug-log', { classList: { add() {}, remove() {}, contains() {}, toggle() {} }, textContent: '' });

    const target = { document: doc };
    globalThis.window = target;

    const debugToggleModule = await import('../scripts/debugToggle.js?test=audio-bus-toggle');
    const { AudioDebugBus, hydrateDebugBus } = await import('../scripts/audio/debugBus.js');

    debugToggleModule.initDebugToggle(target, { document: doc });
    debugToggleModule.setDebugVisibility(true, doc);
    await hydrateDebugBus();

    assert.strictEqual(target.DebugToggles.audioDebugBus, true, 'debug panel should enable the audio debug bus toggle');
    assert.strictEqual(AudioDebugBus.enabled, true, 'debug panel should hydrate the audio debug bus on demand');

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
