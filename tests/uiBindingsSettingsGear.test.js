import assert from 'assert';
import { createStubDocument, createStubElement } from './helpers/domStubs.js';

async function testSettingsGearOpensSidebar() {
    const originalDocument = global.document;
    try {
        const doc = createStubDocument();
        const settingsButton = doc.register('btn-settings-gear', createStubElement('button'));
        global.document = doc;

        const calls = [];
        const game = {
            toggleSidebar: (forceOpen) => {
                calls.push(forceOpen);
            }
        };

        const { setupUIBindings } = await import('../scripts/uiBindings.js');
        setupUIBindings(game);

        settingsButton.onclick();
        assert.deepStrictEqual(calls, [true], 'settings gear should open the sidebar');
    } finally {
        global.document = originalDocument;
    }
}

async function run() {
    await testSettingsGearOpensSidebar();
    console.log('UI bindings settings gear tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
