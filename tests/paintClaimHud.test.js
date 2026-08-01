import assert from 'assert';
import fs from 'fs';

function createStubInput(dataset) {
    return {
        dataset: { ...dataset },
        checked: false
    };
}

function createStubDocument() {
    const inputs = new Map();
    return {
        querySelectorAll: (selector) => inputs.get(selector) || [],
        registerInputs: (selector, elements) => {
            inputs.set(selector, elements);
        }
    };
}

async function testPaintClaimSettingsToggle() {
    const doc = createStubDocument();
    const paintToggle = createStubInput({ generalToggle: 'paintToClaim' });
    doc.registerInputs('[data-general-toggle]', [paintToggle]);
    global.document = doc;
    const { updateSettingsUI } = await import('../scripts/uiBindings.js');

    const game = {
        getGeneralSettings: () => ({ paintToClaim: true })
    };

    updateSettingsUI(game);

    assert.strictEqual(paintToggle.checked, true, 'settings toggle should reflect stored paint-to-claim state');
}

function testTemplateHasPaintClaimSetting() {
    const html = fs.readFileSync('Wargame.html', 'utf8');
    assert.ok(html.includes('data-general-toggle="paintToClaim"'), 'settings template should expose paint-to-claim toggle');
    assert.ok(html.includes('Paint-to-Claim'), 'settings label should mention paint-to-claim');
    assert.ok(!html.includes('id="btn-claim-paint"'), 'paint claim HUD button should be removed');
    assert.ok(!html.includes('id="paint-claim-status"'), 'paint claim HUD status should be removed');
}

async function run() {
    await testPaintClaimSettingsToggle();
    testTemplateHasPaintClaimSetting();
    delete global.document;
    console.log('Paint claim settings tests passed.');
}

await run();
