import { applyNotificationBindings } from './ui/notifications.js';
import {
    bindVoidClickEasterEgg,
    createHudDrawerController,
    hideTileCallout,
    renderMandatesPanel,
    setupInput,
    setupUIBindings,
    showOverworldUI,
    showTileCallout,
    toggleMandatesPanel,
    toggleSidebar,
    updateHUD,
    updateLeaderboardUI,
    updateSaveSlotsUI,
    updateSaveStatus,
    updateSettingsUI,
    updateTileInspector,
    updateUpgradeMenu
} from './ui/hud.js';
import { toggleResearch, updateResearchUI } from './ui/research.js';
import {
    hideWarTip,
    showFloatingText,
    showWarTip,
    spawnBurstAtHex,
    spawnParticleBurst,
    spawnTxt,
    triggerCameraShake
} from './ui/effects.js';

/**
 * Bind UI helper methods onto the provided game object so gameplay code can
 * update the DOM without embedding DOM logic in script.js.
 * @param {object} game live game singleton.
 * @param {object} deps supporting utilities (Hex, Layout, tips array).
 */
export function applyUIBindings(game, deps = {}) {
    const dependencies = { ...deps };
    const notificationStack = applyNotificationBindings();

    game.bindVoidClickEasterEgg = () => bindVoidClickEasterEgg(game, dependencies);
    game.setupInput = () => setupInput(game);
    game.toggleSidebar = (forceState) => toggleSidebar(forceState);
    game.toggleMandatesPanel = (forceState) => toggleMandatesPanel(forceState);
    game.updateSaveStatus = (msg) => updateSaveStatus(msg);
    game.updateSaveSlotsUI = () => updateSaveSlotsUI(game);
    game.toggleResearch = (forceOpen) => toggleResearch(game, forceOpen);
    game.updateResearchUI = () => updateResearchUI(game);
    game.updateLeaderboardUI = () => updateLeaderboardUI(game);
    game.updateSettingsUI = () => updateSettingsUI(game);
    game.updateUpgradeMenu = () => updateUpgradeMenu(game);
    game.updateHUD = () => updateHUD(game);
    game.updateTileInspector = (tile) => updateTileInspector(game, tile);
    game.showFloatingText = (x, y, txt, cssClass) => showFloatingText(game, x, y, txt, cssClass);
    game.triggerCameraShake = () => triggerCameraShake(game);
    game.spawnParticleBurst = (x, y, count, colors) => spawnParticleBurst(game, x, y, count, colors);
    game.spawnBurstAtHex = (pos, count) => spawnBurstAtHex(game, dependencies, pos, count);
    game.spawnTxt = (pos, txt, col) => spawnTxt(game, dependencies, pos, txt, col);
    game.showWarTip = () => showWarTip(dependencies);
    game.hideWarTip = () => hideWarTip();
    game.showOverworldUI = () => showOverworldUI();
    game.showTileCallout = (tile, opts) => showTileCallout(game, tile, opts);
    game.hideTileCallout = () => hideTileCallout();
    game.renderMandatesPanel = () => renderMandatesPanel();
    game.hudDrawer = createHudDrawerController(game);

    game.enqueueNotification = (payload) => notificationStack.enqueueNotification(payload);
    game.dismissNotification = (id) => notificationStack.dismissNotification(id);
    game.getNotificationStack = () => notificationStack.getNotificationStack();
}

export { setupUIBindings };
export {
    createHudDrawerController,
    hideTileCallout,
    renderMandatesPanel,
    showTileCallout,
    toggleMandatesPanel,
    toggleSidebar,
    updateHUD,
    updateResearchUI,
    updateTileInspector
};
export {
    hideWarTip,
    showFloatingText,
    showWarTip,
    spawnBurstAtHex,
    spawnParticleBurst,
    spawnTxt,
    triggerCameraShake
};
