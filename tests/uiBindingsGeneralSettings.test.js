import assert from 'assert';

function createStubInput(dataset) {
    const handlers = new Map();
    return {
        dataset: { ...dataset },
        checked: false,
        addEventListener: (event, handler) => {
            handlers.set(event, handler);
        },
        trigger: (event) => {
            const handler = handlers.get(event);
            if (handler) handler();
        }
    };
}

function createStubDocument() {
    const registry = new Map();
    return {
        body: {},
        addEventListener: () => {},
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: (selector) => registry.get(selector) || [],
        registerInputs: (selector, elements) => {
            registry.set(selector, elements);
        }
    };
}

async function testGeneralToggleBinding() {
    const documentStub = createStubDocument();
    const toggle = createStubInput({ generalToggle: 'paintToClaim' });
    documentStub.registerInputs('[data-general-toggle]', [toggle]);
    documentStub.registerInputs('[data-audio-setting]', []);
    documentStub.registerInputs('[data-visual-toggle]', []);
    documentStub.registerInputs('.slot-save', []);
    documentStub.registerInputs('.slot-load', []);
    global.document = documentStub;

    const calls = [];
    const game = {
        settingsService: {
            applyGeneral: (payload) => {
                calls.push(payload);
                return payload;
            }
        }
    };

    const { setupUIBindings } = await import('../scripts/uiBindings.js');
    setupUIBindings(game);

    toggle.checked = true;
    toggle.trigger('change');

    assert.deepStrictEqual(calls, [{ paintToClaim: true }], 'general toggle should call settingsService.applyGeneral');
}

async function testGeneralToggleSnapshotSync() {
    const documentStub = createStubDocument();
    const toggle = createStubInput({ generalToggle: 'paintToClaim' });
    documentStub.registerInputs('[data-general-toggle]', [toggle]);
    documentStub.registerInputs('[data-audio-setting]', []);
    documentStub.registerInputs('[data-visual-toggle]', []);
    global.document = documentStub;

    const { updateSettingsUI } = await import('../scripts/uiBindings.js');

    const game = {
        settingsService: {
            getSnapshot: () => ({
                general: {
                    paintToClaim: true
                }
            })
        }
    };

    updateSettingsUI(game);

    assert.strictEqual(toggle.checked, true, 'general toggle should reflect settings snapshot state');
}

async function run() {
    await testGeneralToggleBinding();
    await testGeneralToggleSnapshotSync();
    delete global.document;
    console.log('UI bindings general settings tests passed.');
}

await run();
