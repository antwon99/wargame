import { bindCalloutHelpers } from './ui/callouts.js';
import { bindHud } from './ui/hud.js';
import { bindNotificationHelpers } from './ui/notifications.js';
import { bindResearchDrawer } from './ui/researchDrawer.js';
import { bindUpgradeDrawer, createHudDrawerController } from './ui/upgradeDrawer.js';

/**
 * Bind UI helper methods onto the provided game object so gameplay code can
 * update the DOM without embedding DOM logic in script.js.
 * @param {object} game live game singleton.
 * @param {object} deps supporting utilities (Hex, Layout, tips array).
 */
export function applyUIBindings(game, deps = {}) {
    const dependencies = { ...deps };

    bindNotificationHelpers(game);
    bindCalloutHelpers(game, dependencies);
    bindHud(game, dependencies);
    bindUpgradeDrawer(game);
    bindResearchDrawer(game);
}

/**
 * Wire DOM event listeners for primary UI controls.
 * @param {object} game live game singleton.
 */
export function setupUIBindings(game) {
    const retreatBtn = document.getElementById('btn-retreat');
    if (retreatBtn) retreatBtn.onclick = (e) => game.endWar('RETREAT', e);

    const drawerController = createHudDrawerController(game);
    game.hudDrawer = drawerController;

    const settings = game.settingsService;

    const upgradeBtn = document.getElementById('btn-upg');
    if (upgradeBtn) upgradeBtn.onclick = () => drawerController.showUpgrades?.();

    const researchBtn = document.getElementById('btn-research');
    if (researchBtn) researchBtn.onclick = () => drawerController.showResearch?.();

    const drawerClose = document.getElementById('hud-drawer-close');
    if (drawerClose) drawerClose.onclick = () => drawerController.hide?.();

    const sidebarToggle = document.getElementById('btn-sidebar-toggle');
    if (sidebarToggle) sidebarToggle.onclick = () => game.toggleSidebar();

    const sidebarClose = document.getElementById('btn-sidebar-close');
    if (sidebarClose) sidebarClose.onclick = () => game.toggleSidebar(false);

    const mandatesBtn = document.getElementById('btn-mandates');
    if (mandatesBtn) mandatesBtn.onclick = () => game.toggleMandatesPanel();

    const mandatesClose = document.getElementById('btn-mandates-close');
    if (mandatesClose) mandatesClose.onclick = () => game.toggleMandatesPanel(false);

    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) resetBtn.onclick = () => { game.resetProgress(); game.updateSaveSlotsUI(); };

    const pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) pauseBtn.onclick = () => game.togglePause();

    document.querySelectorAll('.slot-save').forEach((btn) => {
        btn.onclick = () => game.saveGame(btn.dataset.slot);
    });
    document.querySelectorAll('.slot-load').forEach((btn) => {
        btn.onclick = () => game.loadGame(btn.dataset.slot);
    });

    document.querySelectorAll('[data-audio-setting]').forEach((input) => {
        input.addEventListener('input', () => {
            const channel = input.dataset.audioSetting;
            const value = Number(input.value) / 100;
            if (settings?.applyAudio) {
                settings.applyAudio({ [channel]: value });
                return;
            }
            if (typeof game.setAudioVolume === 'function') game.setAudioVolume(channel, value);
        });
    });

    document.querySelectorAll('[data-visual-toggle]').forEach((input) => {
        input.addEventListener('change', () => {
            if (settings?.applyVisual) {
                settings.applyVisual({ [input.dataset.visualToggle]: input.checked });
                return;
            }
            if (typeof game.setSnowToggle === 'function') game.setSnowToggle(input.dataset.visualToggle, input.checked);
        });
    });

    if (typeof game.updateSettingsUI === 'function') game.updateSettingsUI();
}

export { createHudDrawerController } from './ui/upgradeDrawer.js';
export { renderMandatesPanel, updateHUD } from './ui/hud.js';
export { updateResearchUI, toggleResearch } from './ui/researchDrawer.js';
