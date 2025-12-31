import { createGameCore } from './core.js';
import { applyUIBindings, setupUIBindings } from '../uiBindings.js';
import { composeGameSettings } from './settings.js';
import { canUseLocalStorage } from '../storageProbe.js';

/**
 * Resolve a safe storage provider for settings persistence. Guards against
 * environments where localStorage is blocked or throws and reports the
 * underlying error for HUD messaging.
 *
 * @param {Window|Object} scope window-like object that may expose localStorage.
 * @returns {{ storage: Storage|null, warning: string|null, error: Error|null }}
 */
export function resolveSettingsStorage(scope = typeof window !== 'undefined' ? window : null) {
    try {
        if (!scope) {
            return { storage: null, warning: 'Local storage unavailable: saves disabled.', error: null };
        }

        const storage = scope.localStorage;
        if (!storage) {
            return { storage: null, warning: 'Local storage unavailable: saves disabled.', error: null };
        }

        const storageProbeOptions = { silent: true };
        if (!canUseLocalStorage(scope, storageProbeOptions)) {
            return { storage: null, warning: 'Local storage blocked: saves disabled.', error: null };
        }
        return { storage, warning: null, error: null };
    } catch (error) {
        return { storage: null, warning: 'Local storage error: saves disabled.', error };
    }
}

/**
 * Compose the Game core with UI bindings and persistence wiring so the
 * browser entry point only needs to import a single bootstrap.
 *
 * @param {object} dependencies explicit runtime helpers (persistence, input helpers, overlays).
 * @returns {Object} active Game instance
 */
export function bootstrapGame(dependencies = {}) {
    const scope = dependencies.windowScope || (typeof window !== 'undefined' ? window : null);
    const { Game, Hex, Layout, TIPS } = createGameCore({ dependencies });
    const { storage, warning, error } = resolveSettingsStorage(scope);

    composeGameSettings(Game, {
        storageKey: Game.settingsStorageKey,
        storage
    });
    applyUIBindings(Game, { Hex, Layout, TIPS });

    if (warning) {
        const banner = `${warning} Settings will reset between sessions.`;
        Game.logBootstrapWarning(banner, error || undefined);
        Game.updateSaveStatus?.(banner);
        Game.enqueueNotification?.({
            id: 'storage-unavailable',
            title: 'Storage Disabled',
            lines: [banner],
            tone: 'warning'
        });
    }

    const loadSnapshot = ({ activeSaveSlot }) => {
    const persistence = Object.prototype.hasOwnProperty.call(dependencies, 'persistence')
        ? dependencies.persistence
        : null;
    if (!persistence) {
        return { state: null, stats: { ...Game.stats }, slot: activeSaveSlot };
    }
    return persistence.loadSnapshot(activeSaveSlot, { hexFactory: (q, r, s) => new Hex(q, r, s) });
};

    if (scope) {
        scope.Hex = Hex;
        scope.Game = Game;
    }

    Game.init({
        introOverlay: dependencies.introOverlay || null,
        loadSnapshot,
        onHUDUpdate: () => Game.updateHUD(),
        onSaveSlotsUpdate: () => Game.updateSaveSlotsUI(),
        onPostInit: () => {
            setupUIBindings(Game);
        }
    });

    return Game;
}
