import { buildDefaultSettings, createSettingsService } from '../settings.js';

/**
 * Compose the settings service for the running Game instance so audio,
 * visuals, and general toggles can be persisted and updated consistently
 * across UI surfaces.
 *
 * @param {Object} game live Game instance.
 * @param {Object} options dependency injection bundle.
 * @param {string} [options.storageKey] persisted storage key.
 * @param {Storage|null} [options.storage] storage provider (e.g. localStorage).
 * @returns {{ settingsService: Object, settingsSnapshot: Object }} service and resolved snapshot.
 */
export function composeGameSettings(game, options = {}) {
    if (!game) throw new Error('composeGameSettings requires a Game instance');

    const settingsService = createSettingsService({
        storageKey: options.storageKey || game.settingsStorageKey,
        storage: options.storage,
        defaults: game.defaultPlayerSettings(),
        audioAdapter: (audio) => {
            const normalized = game.applyAudioSettings(audio);
            game.playerSettings = { ...(game.playerSettings || {}), audio: normalized };
        },
        visualAdapter: (visuals) => {
            game.applyVisualSettings(visuals);
            game.playerSettings = { ...(game.playerSettings || {}), visuals };
        },
        generalAdapter: (general) => {
            game.applyGeneralSettings(general);
            game.playerSettings = { ...(game.playerSettings || {}), general };
        },
        onError: (context, error) => game.reportRecoverableError?.(context, error)
    });

    settingsService.on('change', (settings) => {
        game.playerSettings = settings;
        game.updateSettingsUI?.();
    });

    const resolvedSettings = settingsService.load();
    const audioSnapshot = settingsService.applyAudio(resolvedSettings.audio);
    const visualSnapshot = settingsService.applyVisual(resolvedSettings.visuals);
    const generalSnapshot = settingsService.applyGeneral(resolvedSettings.general);
    const settingsSnapshot = { audio: audioSnapshot, visuals: visualSnapshot, general: generalSnapshot };

    game.settingsService = settingsService;
    game.playerSettings = settingsSnapshot;

    return { settingsService, settingsSnapshot };
}

/**
 * Gather the live snow toggle values so debug overlays can mirror runtime
 * configuration without reaching into Game internals.
 * @param {Object} game live Game instance.
 * @returns {Object} snapshot of boolean snow toggles.
 */
export function resolveSnowDebugSnapshot(game) {
    const snowToggles = game?.featureToggles?.snow || {};
    return {
        snowEnabled: snowToggles.enabled !== false,
        snowfallEnabled: snowToggles.snowfallEnabled !== false
    };
}

/**
 * Flip debug-only snow feature toggles and persist them through the settings
 * service when available.
 * @param {Object} game live Game instance.
 * @param {string} key snow toggle key to update (snowEnabled|snowfallEnabled).
 * @param {boolean} isEnabled desired state for the toggle.
 * @returns {Object} resulting snow toggle collection.
 */
export function setSnowToggle(game, key, isEnabled) {
    const supportedSnowToggles = new Set(['snowEnabled', 'snowfallEnabled']);
    if (!supportedSnowToggles.has(key)) return game?.featureToggles?.snow || buildDefaultSettings().visuals;

    if (game?.settingsService) {
        game.settingsService.applyVisual({ [key]: Boolean(isEnabled) });
        return game.featureToggles?.snow || {};
    }

    const defaults = game?.defaultPlayerSettings?.().visuals || buildDefaultSettings().visuals;
    const safe = { ...defaults, [key]: Boolean(isEnabled) };
    return game?.applyVisualSettings?.(safe) || safe;
}
