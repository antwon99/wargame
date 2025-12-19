import { bindFxHelpers } from './fxBindings.js';
import { createHudDrawerController, toggleResearch, updateHUD, updateResearchUI } from './hudDrawerBindings.js';
import { bindNotificationHelpers } from './notificationBindings.js';
import {
    hideTileCallout,
    showTileCallout,
    updateTileAttackOverlay,
    updateTileInspector
} from './tileOverlayBindings.js';

/**
 * UI binding helpers responsible for DOM wiring and presentation updates.
 * These functions keep script.js focused on core game logic.
 */
export function applyUIBindings(game, deps = {}) {
    const dependencies = { ...deps };

    bindNotificationHelpers(game);
    bindFxHelpers(game, dependencies);

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
    game.updateTileAttackOverlay = (tile) => updateTileAttackOverlay(game, tile);
    game.showOverworldUI = () => showOverworldUI();
    game.showTileCallout = (tile, opts) => showTileCallout(game, tile, opts);
    game.hideTileCallout = () => hideTileCallout();
    game.renderMandatesPanel = () => renderMandatesPanel();
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
    if (mandatesBtn) mandatesBtn.onclick = () => toggleMandatesPanel();

    const mandatesClose = document.getElementById('btn-mandates-close');
    if (mandatesClose) mandatesClose.onclick = () => toggleMandatesPanel(false);

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

function bindVoidClickEasterEgg(game, deps) {
    const HexImpl = deps.Hex || game.Hex || window.Hex;
    const LayoutImpl = deps.Layout || window.Layout || {};
    game.voidClicks = 0;
    game.handleVoidClick = (x, y) => {
        const hit = game.isPointerOnDrawnHex(x, y);
        if (hit && hit.hit) return;

        game.voidClicks += 1;
        const outcome = typeof VoidEasterEgg !== 'undefined'
            ? VoidEasterEgg.computeMessage(game.voidClicks)
            : { message: 'Out of Bounds', isSassy: false };

        const layout = { origin: game.cam, size: 30 * game.cam.zoom, ...LayoutImpl };
        const targetHex = hit && hit.hex ? new HexImpl(hit.hex.q, hit.hex.r, hit.hex.s) : HexImpl.fromPixel(layout, { x, y });
        const color = outcome.isSassy ? '#ef476f' : '#aaa';
        game.spawnTxt(targetHex, outcome.message, color);
    };
}

function setupInput(game) {
    let isDrag = false;
    let start = { x: 0, y: 0 };
    let camStart = { x: 0, y: 0 };
    const onDown = (x, y) => { isDrag = true; start = { x, y }; camStart = { x: game.cam.x, y: game.cam.y }; };
    const onMove = (x, y) => {
        if (isDrag) { game.cam.x = camStart.x + (x - start.x); game.cam.y = camStart.y + (y - start.y); }
        else if (typeof game.onHover === 'function') { game.onHover(x, y); }
    };
    const onUp = (x, y) => {
        if (isDrag) {
            isDrag = false;
            if (Math.hypot(x - start.x, y - start.y) < 10) {
                const hit = game.isPointerOnDrawnHex(x, y);
                if (hit && hit.hit) game.onClick(x, y);
                else if (game.handleVoidClick) game.handleVoidClick(x, y);
            }
        }
    };
    game.canvas.addEventListener('pointerdown', (e) => onDown(e.clientX, e.clientY));
    game.canvas.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY));
    game.canvas.addEventListener('pointerup', (e) => onUp(e.clientX, e.clientY));
    game.canvas.addEventListener('wheel', (e) => { e.preventDefault(); game.cam.zoom = Math.max(0.4, Math.min(2.5, game.cam.zoom - e.deltaY * 0.001)); }, { passive: false });
}

function toggleSidebar(forceState) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', shouldOpen);
    document.body.classList.toggle('sidebar-open', shouldOpen);
}

/**
 * Toggle the lightweight mandates/task flyout without blocking canvas pointer events.
 * The container keeps pointer-events disabled so the map remains interactive while open.
 * @param {boolean} [forceState] optional explicit open/close state.
 */
function toggleMandatesPanel(forceState) {
    const panel = document.getElementById('mandates-panel');
    if (!panel) return;
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !panel.classList.contains('open');
    if (shouldOpen) renderMandatesPanel();
    panel.classList.toggle('open', shouldOpen);
    panel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    const trigger = document.getElementById('btn-mandates');
    if (trigger) trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function getImperialMandatesApi() {
    if (typeof ImperialMandates !== 'undefined') return ImperialMandates;
    if (typeof globalThis !== 'undefined' && globalThis.ImperialMandates) return globalThis.ImperialMandates;
    return null;
}

function renderDeadlineMeta(mandate, api) {
    const helper = api?.describeDeadlineTick;
    if (typeof helper === 'function') return helper(mandate.deadlineTick);

    const fallbackRemaining = Number.isFinite(mandate.deadlineTick)
        ? mandate.deadlineTick - (api?.getKingState?.()?.currentTick || 0)
        : null;
    return {
        label: Number.isFinite(mandate.deadlineTick) ? `Day ${mandate.deadlineTick}` : 'No fixed deadline',
        remainingDays: fallbackRemaining
    };
}

function getMandateBadgeTone(mandate, deadlineMeta = {}) {
    const status = (mandate.status || '').toUpperCase();
    if (status === 'SUCCEEDED') return 'completed';
    if (status === 'FAILED' || status === 'EXPIRED') return 'failed';
    if (typeof deadlineMeta.remainingDays === 'number' && deadlineMeta.remainingDays <= 2) return 'warning';
    return 'active';
}

function formatRemainingDays(remaining) {
    if (remaining === null || remaining === undefined) return 'No deadline';
    if (remaining <= 0) return 'Past due';
    if (remaining === 1) return '1 day remaining';
    return `${remaining} days remaining`;
}

/**
 * Render the current set of active imperial mandates into the HUD flyout.
 * Pulls from ImperialMandates.getActiveMandates() to stay in sync with the
 * authoritative state machine and keep map interactions live while open.
 * @returns {Array<object>} mandates rendered for easier introspection in tests.
 */
export function renderMandatesPanel() {
    if (typeof document === 'undefined') return [];
    const body = document.getElementById('mandates-panel-body');
    if (!body) return [];

    const api = getImperialMandatesApi();
    const activeMandates = api?.getActiveMandates?.() || [];

    body.innerHTML = '';
    if (!activeMandates.length) {
        const empty = document.createElement('p');
        empty.className = 'mandates-panel__empty';
        empty.innerText = 'No active mandates yet.';
        body.appendChild(empty);
        return activeMandates;
    }

    const list = document.createElement('div');
    list.className = 'mandates-panel__list';
    activeMandates.forEach((mandate) => {
        const deadlineMeta = renderDeadlineMeta(mandate, api);
        const badgeTone = getMandateBadgeTone(mandate, deadlineMeta);

        const card = document.createElement('article');
        card.className = 'mandate-card';

        const header = document.createElement('div');
        header.className = 'mandate-card__header';

        const title = document.createElement('h4');
        title.className = 'mandate-card__title';
        title.innerText = mandate.title;

        const badge = document.createElement('span');
        badge.className = `mandate-badge mandate-badge--${badgeTone}`;
        badge.innerText = badgeTone === 'warning' ? 'Warning' : badgeTone.charAt(0).toUpperCase() + badgeTone.slice(1);

        header.appendChild(title);
        header.appendChild(badge);

        const desc = document.createElement('p');
        desc.className = 'mandate-card__description';
        desc.innerText = mandate.description;

        const footer = document.createElement('div');
        footer.className = 'mandate-card__deadline';

        const deadlineLabel = document.createElement('span');
        deadlineLabel.className = 'mandate-card__deadline-label';
        deadlineLabel.innerText = deadlineMeta.label;

        const remaining = document.createElement('span');
        remaining.className = 'mandate-card__remaining';
        remaining.innerText = formatRemainingDays(deadlineMeta.remainingDays);

        footer.appendChild(deadlineLabel);
        footer.appendChild(remaining);

        card.appendChild(header);
        card.appendChild(desc);
        card.appendChild(footer);
        list.appendChild(card);
    });

    body.appendChild(list);
    return activeMandates;
}

function updateSaveStatus(msg) {
    const el = document.getElementById('save-status');
    if (el) el.innerText = msg;
}

function updateSaveSlotsUI(game) {
    if (typeof Persistence === 'undefined' || !Persistence.getSlotMetadata) return;
    const label = document.getElementById('active-slot-label');
    if (label) label.innerText = `Slot ${game.activeSaveSlot} Active`;

    const SAVE_SLOTS = ['1', '2', '3'];
    SAVE_SLOTS.forEach((slot) => {
        const meta = Persistence.getSlotMetadata(slot);
        const caption = document.querySelector(`[data-slot-caption="${slot}"]`);
        const loadBtn = document.querySelector(`.slot-load[data-slot="${slot}"]`);
        if (caption) {
            if (meta.hasSave) {
                const when = meta.lastSaveISO ? new Date(meta.lastSaveISO).toLocaleString() : 'Unknown Time';
                const level = meta.level !== null ? meta.level : '?';
                caption.innerText = `Level ${level} - Saved: ${when}`;
            } else {
                caption.innerText = 'Empty Slot';
            }
        }
        if (loadBtn) loadBtn.disabled = !meta.hasSave;
    });
}

function updateLeaderboardUI(game) {
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setTxt('stat-best-lvl', game.stats.bestLevel || 0);
    setTxt('stat-best-kills', game.stats.bestKills || 0);
    setTxt('stat-total-kills', game.stats.totalKills || 0);
    setTxt('stat-wars', game.stats.warsFought || 0);
    if (game.stats.lastSaveISO) game.updateSaveStatus(`Last saved ${game.stats.lastSaveISO}`);
}

function updateSettingsUI(game) {
    const sliders = document.querySelectorAll('[data-audio-setting]');
    sliders.forEach((input) => {
        const channel = input.dataset.audioSetting;
        const multiplier = game.audioSettings?.[channel];
        if (typeof multiplier === 'number') input.value = Math.floor(multiplier * 100);
    });

    const toggles = document.querySelectorAll('[data-visual-toggle]');
    toggles.forEach((input) => {
        const key = input.dataset.visualToggle;
        const current = game.visualSettings?.[key];
        if (typeof current === 'boolean') input.checked = current;
    });
}

function updateUpgradeMenu(game) {
    const upg = game.upgrades;
    const goldNum = document.getElementById('upg-gold');
    const woodNum = document.getElementById('upg-wood');
    if (goldNum) goldNum.innerText = Math.floor(game.gold);
    if (woodNum) woodNum.innerText = Math.floor(game.wood);
    const costKeys = ['soldier', 'archer', 'production', 'mines', 'defense'];
    costKeys.forEach((key) => {
        const btn = document.querySelector(`#buy-${key === 'production' ? 'prod' : key}`);
        const label = document.querySelector(`#cost-${key}`);
        const cost = game.getUpgradeCost(key);
        const remaining = game.remainingUpgradePurchases(key);
        const affordable = game.canPayCost(cost) && remaining > 0;
        const costLabel = cost ? game.formatCost(cost) : 'N/A';
        if (label) label.innerText = `${costLabel}${remaining ? ` (${remaining} left)` : ''}`;
        if (btn) {
            btn.disabled = !affordable;
            btn.classList.toggle('affordable', affordable);
            btn.classList.toggle('purchased', !remaining);
        }
    });
}

function showOverworldUI() {
    const overworld = document.getElementById('ui-overworld');
    const combat = document.getElementById('ui-combat');
    const stateTxt = document.getElementById('state-txt');
    overworld?.classList.add('visible');
    combat?.classList.remove('visible');
    if (stateTxt) stateTxt.innerText = 'KINGDOM';
}

export { createHudDrawerController, updateResearchUI } from './hudDrawerBindings.js';
export {
    hideTileCallout,
    showTileCallout,
    updateTileAttackOverlay,
    updateTileInspector
} from './tileOverlayBindings.js';
