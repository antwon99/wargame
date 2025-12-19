import { createGameCore } from './core.js';
import { applyUIBindings, setupUIBindings } from '../uiBindings.js';
import { composeGameSettings } from './settings.js';
import { update as updateAudioDebugPanel } from '../../audio/debugPanel.js';

const IntroOverlay = (typeof window !== 'undefined' && window.IntroOverlay) ? window.IntroOverlay : null;

/**
 * Compose the Game core with UI bindings and persistence wiring so the
 * browser entry point only needs to import a single bootstrap.
 * @returns {Object} active Game instance
 */
export function bootstrapGame() {
    const { Game, Hex, Layout, TIPS } = createGameCore();
    composeGameSettings(Game, {
        storageKey: Game.settingsStorageKey,
        storage: typeof window !== 'undefined' ? window.localStorage : null
    });
    applyUIBindings(Game, { Hex, Layout, TIPS });

    if (typeof window !== 'undefined') {
        window.Hex = Hex;
        window.Game = Game;
    }

    Game.init({
        introOverlay: IntroOverlay,
        onHUDUpdate: () => Game.updateHUD(),
        onSaveSlotsUpdate: () => Game.updateSaveSlotsUI(),
        onPostInit: () => {
            setupUIBindings(Game);
        }
    });

    startGameLoop(Game);

    return Game;
}

/**
 * Route the main render/update loop between overworld and combat depending on state.
 * @param {object} game active Game instance.
 */
export function startGameLoop(game) {
    if (typeof requestAnimationFrame !== 'function') {
        console.warn('Render loop unavailable in this environment; skipping frame scheduling.');
        return;
    }

    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
    let lastTime = now;

    const step = (now) => {
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        try {
            game.ctx.globalAlpha = 1.0;
            game.snow.time = (game.snow.time || 0) + dt;
            game.runSafely(() => game.updateCameraDrift(dt), 'camera drift update');
            if (game.state === 'OVERWORLD') game.runSafely(() => game.updateOverworld(dt), 'overworld update');
            else if (game.state === 'COMBAT') game.runSafely(() => game.updateCombat(dt), 'combat update');

            game.runSafely(() => game.stepCombatFx(dt), 'combat fx step');
            game.runSafely(() => game.stepCombatParticles(dt), 'combat particle step');
            game.draw();
            updateAudioDebugPanel(dt, game.state);
        } catch (error) {
            game.reportRecoverableError('game loop', error);
            game.endWar(false);
        }

        requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
}
