import { createGameCore } from './core.js';
import { applyUIBindings, setupUIBindings } from '../uiBindings.js';

const IntroOverlay = (typeof window !== 'undefined' && window.IntroOverlay) ? window.IntroOverlay : null;

/**
 * Compose the Game core with UI bindings and persistence wiring so the
 * browser entry point only needs to import a single bootstrap.
 * @returns {Object} active Game instance
 */
export function bootstrapGame() {
    const { Game, Hex, Layout, TIPS } = createGameCore();
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

    return Game;
}
