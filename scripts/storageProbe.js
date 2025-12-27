/**
 * Detect whether localStorage is available and writable for the current
 * environment. The probe defends against security exceptions thrown by
 * privacy modes or disabled storage so callers can gracefully fall back
 * without crashing the UI.
 *
 * @param {Window|Object} [scope] optional scope exposing a localStorage-like property.
 * @returns {boolean} true when storage can be touched, false otherwise.
 */
export function canUseLocalStorage(scope = typeof window !== 'undefined' ? window : globalThis) {
    try {
        const storage = scope && scope.localStorage;
        if (!storage || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
            return false;
        }

        const probeKey = '__hex-war-storage-probe__';
        storage.setItem(probeKey, 'ok');
        storage.removeItem(probeKey);
        return true;
    } catch (error) {
        console.warn('Local storage unavailable', error);
        return false;
    }
}

const api = { canUseLocalStorage };

/**
 * Register the storage probe helper on the provided global scope.
 * @param {Window|Object} [target] global object to attach StorageProbe to.
 * @returns {Object} storage probe API.
 */
export function initStorageProbe(target = typeof window !== 'undefined' ? window : undefined) {
    if (target) {
        target.StorageProbe = api;
    }
    return api;
}

if (typeof module !== 'undefined') {
    module.exports = { ...api, initStorageProbe };
}
