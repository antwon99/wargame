import { createGameCore } from './core.js';
import { applyUIBindings, setupUIBindings } from '../uiBindings.js';
import { composeGameSettings } from './settings.js';
import { canUseLocalStorage } from '../storageProbe.js';

const IntroOverlay = (typeof window !== 'undefined' && window.IntroOverlay) ? window.IntroOverlay : null;
const Persistence = (typeof window !== 'undefined' && window.Persistence)
    ? window.Persistence
    : (typeof require === 'function' ? require('../persistence.js') : null);

/**
 * Resolve a safe storage provider for settings persistence. Guards against
 * environments where localStorage is blocked or throws and reports the
 * underlying error for HUD messaging.
 *
 * @param {Window|Object} scope window-like object that may expose localStorage.
 * @returns {{ storage: Storage|null, warning: string|null, error: Error|null }}
 */
export function resolveSettingsStorage(scope = typeof window !== 'undefined' ? window : null) {
    if (!scope || !scope.localStorage) {
        return { storage: null, warning: 'Local storage unavailable: saves disabled.', error: null };
    }

    try {
        if (!canUseLocalStorage(scope)) {
            return { storage: null, warning: 'Local storage blocked: saves disabled.', error: null };
        }
        return { storage: scope.localStorage, warning: null, error: null };
    } catch (error) {
        return { storage: null, warning: 'Local storage error: saves disabled.', error };
    }
}

/**
 * Compose the Game core with UI bindings and persistence wiring so the
 * browser entry point only needs to import a single bootstrap.
 * @returns {Object} active Game instance
 */
export function bootstrapGame() {
    const { Game, Hex, Layout, TIPS } = createGameCore();
    const { storage, warning, error } = resolveSettingsStorage(typeof window !== 'undefined' ? window : null);

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
        if (!Persistence) {
            return { state: null, stats: { ...Game.stats }, slot: activeSaveSlot };
        }
        return Persistence.loadSnapshot(activeSaveSlot, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    };

    if (typeof window !== 'undefined') {
        window.Hex = Hex;
        window.Game = Game;
    }

    Game.init({
        introOverlay: IntroOverlay,
        loadSnapshot,
        onHUDUpdate: () => Game.updateHUD(),
        onSaveSlotsUpdate: () => Game.updateSaveSlotsUI(),
        onPostInit: () => {
            setupUIBindings(Game);
        }
    });

    return Game;
}
