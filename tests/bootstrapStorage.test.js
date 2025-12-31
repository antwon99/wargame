import assert from 'assert';
import { resolveSettingsStorage } from '../scripts/game/bootstrap.js';

function createScopeWithStorage(storageImpl) {
    return { localStorage: storageImpl };
}

const noopStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};

// Storage that explodes to simulate privacy lockdowns.
const explosiveStorage = {
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
};

const guardedStorage = {
    setItem: () => { throw new Error('read-only'); },
    removeItem: () => {}
};

const warningWithSuffix = (warning) => warning?.includes('Local storage');

function run() {
    const openScope = createScopeWithStorage(noopStorage);
    const safeResult = resolveSettingsStorage(openScope);
    assert.strictEqual(safeResult.storage, noopStorage, 'available storage should be passed through');
    assert.strictEqual(safeResult.warning, null);

    const missingResult = resolveSettingsStorage(null);
    assert.strictEqual(missingResult.storage, null);
    assert.ok(warningWithSuffix(missingResult.warning), 'missing scope should yield a warning');

    let warnCount = 0;
    const originalWarn = console.warn;
    console.warn = () => {
        warnCount += 1;
    };
    try {
        const failingScope = createScopeWithStorage(explosiveStorage);
        const failingResult = resolveSettingsStorage(failingScope);
        assert.strictEqual(failingResult.storage, null, 'unsafe storage should be ignored');
        assert.ok(warningWithSuffix(failingResult.warning));

        const blockedScope = createScopeWithStorage(guardedStorage);
        const blockedResult = resolveSettingsStorage(blockedScope);
        assert.strictEqual(blockedResult.storage, null);
        assert.ok(warningWithSuffix(blockedResult.warning));
    } finally {
        console.warn = originalWarn;
    }
    assert.strictEqual(warnCount, 0, 'storage probe should silence console warnings');

    console.log('Bootstrap storage guard tests passed.');
}

run();
