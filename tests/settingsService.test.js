import assert from 'assert';
import { buildDefaultSettings, createSettingsService } from '../scripts/settings.js';

function createMemoryStorage() {
    const store = new Map();
    return {
        getItem: (key) => store.has(key) ? store.get(key) : null,
        setItem: (key, value) => { store.set(key, value); },
        removeItem: (key) => { store.delete(key); }
    };
}

const defaults = buildDefaultSettings();

{
    const storage = createMemoryStorage();
    storage.setItem('settings:test', JSON.stringify({
        audio: { master: 0.25 },
        visuals: { snowEnabled: false },
        general: { paintToClaim: true }
    }));
    const service = createSettingsService({ storageKey: 'settings:test', storage, defaults });
    let emitted = null;
    service.on('change', (snapshot) => { emitted = snapshot; });
    const loaded = service.load();
    assert.strictEqual(loaded.audio.master, 0.25, 'retains saved audio slider');
    assert.strictEqual(loaded.visuals.snowEnabled, false, 'retains saved visual toggle');
    assert.strictEqual(loaded.general.paintToClaim, true, 'retains saved general toggle');
    assert.deepStrictEqual(emitted.visuals, loaded.visuals, 'emits change event on load');
}

{
    const storage = createMemoryStorage();
    let adapterPayload = null;
    const service = createSettingsService({ storageKey: 'settings:audio', storage, defaults, audioAdapter: (payload) => { adapterPayload = payload; } });
    const applied = service.applyAudio({ master: 2, music: 0.15, sfx: 0 });
    const persisted = JSON.parse(storage.getItem('settings:audio'));
    assert.deepStrictEqual(applied, { master: 1, music: 0.15, sfx: 0 }, 'clamps and returns normalized audio');
    assert.deepStrictEqual(adapterPayload, applied, 'invokes audio adapter with normalized payload');
    assert.strictEqual(persisted.audio.master, 1, 'persists normalized master value');
}

{
    const storage = createMemoryStorage();
    let visualEvent = null;
    const service = createSettingsService({ storageKey: 'settings:visual', storage, defaults });
    service.on('visual', (payload) => { visualEvent = payload; });
    const visuals = service.applyVisual({ snowEnabled: false, snowfallEnabled: false });
    assert.strictEqual(visuals.snowEnabled, false, 'applies supplied visual toggle');
    assert.strictEqual(visualEvent.snowfallEnabled, false, 'emits visual event payload');
    assert.strictEqual(JSON.parse(storage.getItem('settings:visual')).visuals.snowEnabled, false, 'persists visual toggles');
}

{
    const storage = createMemoryStorage();
    let generalEvent = null;
    const service = createSettingsService({ storageKey: 'settings:general', storage, defaults });
    service.on('general', (payload) => { generalEvent = payload; });
    const general = service.applyGeneral({ paintToClaim: true });
    assert.strictEqual(general.paintToClaim, true, 'applies supplied general toggle');
    assert.strictEqual(generalEvent.paintToClaim, true, 'emits general event payload');
    assert.strictEqual(JSON.parse(storage.getItem('settings:general')).general.paintToClaim, true, 'persists general toggles');
}

{
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
        value: {
            get localStorage() {
                throw new Error('denied');
            }
        },
        configurable: true
    });
    try {
        let service = null;
        assert.doesNotThrow(() => { service = createSettingsService({ defaults }); });
        const loaded = service.load();
        assert.deepStrictEqual(loaded, defaults, 'falls back to defaults when storage is inaccessible');
    } finally {
        if (typeof originalWindow === 'undefined') {
            delete globalThis.window;
        } else {
            Object.defineProperty(globalThis, 'window', {
                value: originalWindow,
                configurable: true
            });
        }
    }
}
