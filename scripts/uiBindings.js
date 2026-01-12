import { createNotificationStack, getSharedStack, setSharedStack } from './notificationStack.js';
import { DEFAULT_IMPERIAL_FAVOR, clampImperialFavor } from './imperialFavor.js';
import { getTileKey } from './utils/tileKey.js';
import { resolveEnemyLevel } from './utils/resolveEnemyLevel.js';
import { RebelSystem } from './rebelSystem.js';
import { beginCombatFromTile } from './game/combatEntry.js';
import { SCORCHED_DOUSE_COST } from './overworldConfig.js';
import {
    DEFAULT_ULTIMATE_LEVELS,
    DEFAULT_ULTIMATE_SELECTION,
    getUltimateDurationMs,
    getUltimateMaxLevel,
    getUltimateUpgradeCost,
    resolveUltimateSelection,
    resolveUltimateLevelValue,
    ULTIMATE_CONFIG
} from './game/ultimatesConfig.js';

/**
 * UI binding helpers responsible for DOM wiring and presentation updates.
 * These functions keep script.js focused on core game logic.
 */

let cachedNotificationStack = null;

const ZOOM_LIMITS = { min: 0.5, max: 2.0 };
const ZOOM_STEP = 0.1;

const SIDEBAR_SECTION_KEYS = ['stats', 'tasks', 'standing', 'settings'];
const SIDEBAR_SECTION_IDS = {
    stats: 'sidebar-section-stats',
    tasks: 'sidebar-section-tasks',
    standing: 'sidebar-section-standing',
    settings: 'sidebar-section-settings'
};
const SIDEBAR_TAB_IDS = {
    stats: 'sidebar-tab-stats',
    tasks: 'sidebar-tab-tasks',
    standing: 'sidebar-tab-standing',
    settings: 'sidebar-tab-settings'
};

/**
 * Determine when Tasks/Standing should route into the sidebar instead of top-bar flyouts.
 * Uses the platform-set body class or a narrow viewport check for responsive behavior.
 * @returns {boolean} true when sidebar routing should be used.
 */
function shouldRouteToSidebar() {
    if (typeof document === 'undefined') return false;
    const body = document.body;
    const hasMobileClass = Boolean(body?.classList?.contains?.('mobile'));
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : null;
    const isNarrowViewport = Number.isFinite(viewportWidth) && viewportWidth <= 768;
    return hasMobileClass || isNarrowViewport;
}

/**
 * Lazily create (or return) the shared notification stack anchored to the game container.
 * Keeping a single instance prevents duplicate DOM overlays when the UI bindings are
 * re-applied after a reset or test harness initialization.
 * @returns {import('./notificationStack.js').NotificationStack|null}
 */
function getOrCreateNotificationStack() {
    if (cachedNotificationStack) return cachedNotificationStack;
    if (typeof document === 'undefined') return null;
    const mountPoint = document.getElementById('game-container') || document.body;
    cachedNotificationStack = createNotificationStack({ mountPoint });
    setSharedStack(cachedNotificationStack);
    return cachedNotificationStack;
}

/**
 * Clamp camera zoom to the shared bounds used across all input methods.
 * @param {number} value candidate zoom level.
 * @returns {number} zoom level restricted to the supported range.
 */
function clampCameraZoom(value) {
    return Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, value));
}

/**
 * Update the camera zoom so UI controls and wheel input stay in sync.
 * @param {object} game live game singleton.
 * @param {number} nextZoom zoom value to apply before clamping.
 */
function setCameraZoom(game, nextZoom) {
    game.cam.zoom = clampCameraZoom(nextZoom);
}

/**
 * Bind UI helper methods onto the provided game object so gameplay code can
 * update the DOM without embedding DOM logic in script.js.
 * @param {object} game live game singleton.
 * @param {object} deps supporting utilities (Hex, Layout, tips array).
 */
export function applyUIBindings(game, deps = {}) {
    const dependencies = { ...deps };

    const notificationStack = getOrCreateNotificationStack();

    game.bindVoidClickEasterEgg = () => bindVoidClickEasterEgg(game, dependencies);
    game.setupInput = () => setupInput(game);
    game.toggleSidebar = (forceState) => toggleSidebar(forceState);
    game.toggleMandatesPanel = (forceState) => toggleMandatesPanel(forceState);
    game.toggleReputationPanel = (forceState) => toggleReputationPanel(game, forceState);
    game.updateSaveStatus = (msg) => updateSaveStatus(msg);
    game.updateSaveSlotsUI = () => updateSaveSlotsUI(game);
    game.toggleResearch = (forceOpen) => toggleResearch(game, forceOpen);
    game.updateResearchUI = () => updateResearchUI(game);
    game.updateLeaderboardUI = () => updateLeaderboardUI(game);
    game.updateSettingsUI = () => updateSettingsUI(game);
    game.updateUpgradeMenu = () => updateUpgradeMenu(game);
    /** Refresh ultimate upgrade details, costs, and effect readouts in the drawer. */
    game.updateUltimatesUI = () => updateUltimatesMenu(game);
    game.updateHUD = () => updateHUD(game);
    game.updateTileInspector = (tile) => updateTileInspector(game, tile);
    game.updateTileAttackOverlay = (tile) => updateTileAttackOverlay(game, tile);
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
    game.renderReputationPanel = () => renderReputationPanel(game);
    /**
     * Surface the shared notification stack so gameplay systems can enqueue toasts without
     * importing DOM code. Cards auto-fade and stack in the HUD corner.
     */
    game.enqueueNotification = (payload) => notificationStack?.enqueue(payload);
    /**
     * Allow direct programmatic dismissal for cases where a notification is superseded
     * (e.g., mandate resolved before the reminder expires).
     */
    game.dismissNotification = (id) => notificationStack?.dismiss(id);
    /** Retrieve the underlying stack instance for advanced UI integration. */
    game.getNotificationStack = () => getSharedStack();
}

/**
 * Shared drawer helpers that keep header metadata and bindings consistent.
 */
/**
 * Refresh the shared drawer header with context for either upgrades or research.
 * @param {'upgrades'|'research'|'ultimates'} mode active drawer view.
 * @param {object} game live game singleton exposing research metadata.
 */
function syncHudDrawerHeader(mode, game) {
    const eyebrow = document.getElementById('hud-drawer-eyebrow');
    const title = document.getElementById('hud-drawer-title');
    const subtitle = document.getElementById('hud-drawer-subtitle');
    const lives = document.getElementById('hud-drawer-lives');
    if (!eyebrow || !title || !subtitle || !lives) return;

    if (mode === 'research') {
        const livesTech = typeof game.getTech === 'function' ? game.getTech('lives') : null;
        const livesCap = livesTech?.maxPurchases || 3;
        eyebrow.innerText = 'Arcane Bureau';
        title.innerText = 'Research';
        subtitle.innerText = 'Spend gold and wood on late-game tech that buffs your economy or rescues doomed runs.';
        lives.innerText = `❤️ ${game.research?.lives ?? 0}/${livesCap}`;
        lives.setAttribute('aria-hidden', 'false');
        lives.style.display = 'inline-flex';
    } else if (mode === 'ultimates') {
        eyebrow.innerText = 'War Room';
        title.innerText = 'Ultimates';
        subtitle.innerText = 'Preview combat ultimates and plan the next battle-changing surge.';
        lives.setAttribute('aria-hidden', 'true');
        lives.style.display = 'none';
    } else {
        eyebrow.innerText = 'Imperial Engineering';
        title.innerText = 'Imperial Upgrades';
        subtitle.innerText = 'Invest resources to harden defenses and accelerate production between wars.';
        lives.setAttribute('aria-hidden', 'true');
        lives.style.display = 'none';
    }
}

/**
 * Attach upgrade purchase handlers after the drawer template has been cloned.
 * @param {object} game live game singleton.
 */
function bindUpgradeButtons(game) {
    const mapping = {
        'buy-soldier': 'soldier',
        'buy-archer': 'archer',
        'buy-prod': 'production',
        'buy-mines': 'mines',
        'buy-defense': 'defense'
    };
    Object.entries(mapping).forEach(([id, key]) => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => game.buyUpgrade(key);
    });
}

/**
 * Attach ultimate purchase handlers after the drawer template has been cloned.
 * @param {object} game live game singleton.
 */
function bindUltimateButtons(game) {
    const mapping = {
        'buy-ultimate-rush': 'rush',
        'buy-ultimate-manpower': 'manpower',
        'buy-ultimate-gold': 'gold'
    };
    Object.entries(mapping).forEach(([id, key]) => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => game.buyUltimate(key);
    });
    const selectMapping = {
        'select-ultimate-rush': 'rush',
        'select-ultimate-manpower': 'manpower',
        'select-ultimate-gold': 'gold'
    };
    Object.entries(selectMapping).forEach(([id, key]) => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => game.selectUltimate?.(key);
    });
}

/**
 * Create and manage the bottom HUD drawer shared by upgrades and research.
 * Handles swapping template content, accessibility states, and close affordances.
 * @param {object} game live game singleton.
 * @returns {object} drawer controller with show/hide helpers.
 */
function createHudDrawerController(game) {
    const drawer = document.getElementById('hud-drawer');
    const anchor = drawer?.closest?.('.hud-controls-anchor') || document;
    const getScopedElement = (selector) => {
        const scoped = anchor?.querySelector?.(selector);
        if (scoped) return scoped;
        if (selector.startsWith('#')) return document.getElementById(selector.slice(1));
        return document.querySelector(selector);
    };
    const contentHost = getScopedElement('#hud-drawer-content');
    const body = getScopedElement('#hud-drawer-body');
    const templates = {
        upgrades: getScopedElement('#drawer-upgrades-template'),
        research: getScopedElement('#drawer-research-template'),
        ultimates: getScopedElement('#drawer-ultimates-template')
    };
    const triggers = {
        upgrades: getScopedElement('#btn-upg'),
        research: getScopedElement('#btn-research'),
        ultimates: getScopedElement('#btn-ultimates')
    };
    const closeBtn = getScopedElement('#hud-drawer-close');

    if (!drawer || !contentHost) {
        return {
            showUpgrades: () => bindUpgradeButtons(game),
            showResearch: () => game.updateResearchUI?.(),
            showUltimates: () => {},
            hide: () => {},
            hideIfActive: () => {},
            activeView: () => null
        };
    }

    let activeView = drawer.dataset.activeView || null;

    const updateTriggerState = (mode, open) => {
        if (drawer) drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
        Object.entries(triggers).forEach(([key, btn]) => {
            if (!btn) return;
            btn.setAttribute('aria-controls', 'hud-drawer');
            const expanded = open && key === mode;
            btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            btn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
        });
    };

    const swapContent = (mode) => {
        contentHost.innerHTML = '';
        const tpl = templates[mode];
        if (tpl && tpl.content) contentHost.appendChild(tpl.content.cloneNode(true));
        drawer.dataset.activeView = mode;
        syncHudDrawerHeader(mode, game);
        if (mode === 'upgrades') {
            bindUpgradeButtons(game);
            game.updateUpgradeMenu?.();
        }
        if (mode === 'research') game.updateResearchUI?.();
        if (mode === 'ultimates') {
            bindUltimateButtons(game);
            game.updateUltimatesUI?.();
        }
        if (body?.scrollTo) body.scrollTo({ top: 0 });
    };

    const hide = () => {
        drawer.classList.remove('open');
        drawer.style.display = 'none';
        activeView = null;
        updateTriggerState(null, false);
    };

    const show = (mode) => {
        activeView = mode;
        swapContent(mode);
        drawer.style.display = 'block';
        drawer.classList.add('open');
        updateTriggerState(mode, true);
    };

    const hideIfActive = (mode) => {
        if (activeView === mode) hide();
    };

    const onDocClick = (evt) => {
        if (!drawer.classList.contains('open')) return;
        const target = evt.target;
        const isTrigger = Object.values(triggers).some(btn => btn && btn.contains(target));
        if (drawer.contains(target) || isTrigger) return;
        hide();
    };

    const onKeyDown = (evt) => {
        if (evt.key === 'Escape' && drawer.classList.contains('open')) hide();
    };

    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    if (closeBtn) closeBtn.onclick = () => hide();

    return {
        showUpgrades: () => show('upgrades'),
        showResearch: () => show('research'),
        showUltimates: () => show('ultimates'),
        hide,
        hideIfActive,
        activeView: () => activeView
    };
}

/**
 * Bind checkbox toggles to a settings group keyed by data attributes.
 * @param {object} config binding configuration.
 * @param {string} config.selector CSS selector for toggle inputs.
 * @param {string} config.datasetKey dataset key holding the setting name.
 * @param {Function} [config.applySettings] handler for applying settings.
 * @param {(key: string, value: boolean, input: HTMLInputElement) => void} [config.fallback]
 * fallback handler when a settings service is unavailable.
 */
function bindToggleInputs({ selector, datasetKey, applySettings, fallback }) {
    document.querySelectorAll(selector).forEach((input) => {
        input.addEventListener('change', () => {
            const key = input.dataset[datasetKey];
            const value = input.checked;
            if (applySettings) {
                applySettings({ [key]: value });
                return;
            }
            if (typeof fallback === 'function') fallback(key, value, input);
        });
    });
}

/**
 * Sync checkbox toggles against the provided settings snapshot.
 * @param {object} config binding configuration.
 * @param {string} config.selector CSS selector for toggle inputs.
 * @param {string} config.datasetKey dataset key holding the setting name.
 * @param {Record<string, boolean>} config.values settings snapshot.
 */
function syncToggleInputs({ selector, datasetKey, values }) {
    document.querySelectorAll(selector).forEach((input) => {
        const key = input.dataset[datasetKey];
        const desired = values && Object.prototype.hasOwnProperty.call(values, key)
            ? values[key]
            : false;
        input.checked = Boolean(desired);
    });
}

/**
 * Wire DOM event listeners for primary UI controls.
 * @param {object} game live game singleton.
 */
export function setupUIBindings(game) {
    const retreatBtn = document.getElementById('btn-retreat');
    if (retreatBtn) retreatBtn.onclick = (e) => game.endWar('RETREAT', e);
    const combatUltimateBtn = document.getElementById('ultimate-button');
    if (combatUltimateBtn) combatUltimateBtn.onclick = () => game.activateUltimate?.();

    const zoomControls = document.getElementById('zoom-controls');
    const zoomViewportMatches = Boolean(
        zoomControls
            && (typeof window === 'undefined'
                || typeof window.matchMedia !== 'function'
                || window.matchMedia('(max-width: 768px)').matches)
    );
    if (zoomViewportMatches) {
        const zoomInBtn = document.getElementById('zoom-in');
        if (zoomInBtn) zoomInBtn.onclick = () => setCameraZoom(game, game.cam.zoom + ZOOM_STEP);
        const zoomOutBtn = document.getElementById('zoom-out');
        if (zoomOutBtn) zoomOutBtn.onclick = () => setCameraZoom(game, game.cam.zoom - ZOOM_STEP);
    }

    const drawerController = createHudDrawerController(game);
    game.hudDrawer = drawerController;

    const settings = game.settingsService;

    const upgradeBtn = document.getElementById('btn-upg');
    if (upgradeBtn) upgradeBtn.onclick = () => drawerController.showUpgrades?.();

    const researchBtn = document.getElementById('btn-research');
    if (researchBtn) researchBtn.onclick = () => drawerController.showResearch?.();

    const ultimatesBtn = document.getElementById('btn-ultimates');
    if (ultimatesBtn) ultimatesBtn.onclick = () => drawerController.showUltimates?.();

    const drawerClose = document.getElementById('hud-drawer-close');
    if (drawerClose) drawerClose.onclick = () => drawerController.hide?.();

    const sidebarToggle = document.getElementById('btn-sidebar-toggle');
    if (sidebarToggle) sidebarToggle.onclick = () => game.toggleSidebar();

    const sidebarClose = document.getElementById('btn-sidebar-close');
    if (sidebarClose) sidebarClose.onclick = () => game.toggleSidebar(false);

    const overviewToggle = document.getElementById('btn-overview');
    if (overviewToggle) overviewToggle.onclick = () => toggleOverviewPanel();

    SIDEBAR_SECTION_KEYS.forEach((key) => {
        const tab = document.getElementById(SIDEBAR_TAB_IDS[key]);
        if (tab) tab.onclick = () => setSidebarSection(key);
    });

    const mandatesTriggers = document.querySelectorAll('[data-mandates-trigger]');
    mandatesTriggers.forEach((trigger) => {
        trigger.onclick = () => {
            const opened = toggleMandatesPanel(trigger.id === 'btn-overview-mandates');
            if (opened) toggleReputationPanel(game, false);
            toggleOverviewPanel(false);
        };
    });

    const reputationTriggers = document.querySelectorAll('[data-reputation-trigger]');
    reputationTriggers.forEach((trigger) => {
        trigger.onclick = () => {
            const opened = toggleReputationPanel(game, trigger.id === 'btn-overview-reputation');
            if (opened) toggleMandatesPanel(false);
            toggleOverviewPanel(false);
        };
    });

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

    bindToggleInputs({
        selector: '[data-visual-toggle]',
        datasetKey: 'visualToggle',
        applySettings: settings?.applyVisual,
        fallback: (key, value) => {
            if (typeof game.setSnowToggle === 'function') game.setSnowToggle(key, value);
        }
    });

    bindToggleInputs({
        selector: '[data-general-toggle]',
        datasetKey: 'generalToggle',
        applySettings: settings?.applyGeneral,
        fallback: (key, value) => {
            if (typeof game.applyGeneralSettings === 'function') {
                game.applyGeneralSettings({ [key]: value });
            }
        }
    });

    if (typeof game.updateSettingsUI === 'function') game.updateSettingsUI();
}

/**
 * Identify the currently active sidebar section key, if any.
 * @returns {string|null} active sidebar section key.
 */
function getActiveSidebarKey() {
    return SIDEBAR_SECTION_KEYS.find((key) => {
        const section = document.getElementById(SIDEBAR_SECTION_IDS[key]);
        return section?.classList?.contains('is-active');
    }) || null;
}

/**
 * Synchronize active sidebar section, tabs, and related button states.
 * @param {string} sectionKey target section key.
 * @param {{ openSidebar?: boolean }} [options] control sidebar open state.
 * @returns {boolean} true when the section is found and activated.
 */
function setSidebarSection(sectionKey, options = {}) {
    const { openSidebar = true } = options;
    const sidebar = document.getElementById('sidebar');
    const targetId = SIDEBAR_SECTION_IDS[sectionKey];
    const targetSection = targetId ? document.getElementById(targetId) : null;
    if (!sidebar || !targetSection) return false;

    SIDEBAR_SECTION_KEYS.forEach((key) => {
        const section = document.getElementById(SIDEBAR_SECTION_IDS[key]);
        if (section) section.classList.toggle('is-active', key === sectionKey);
    });

    SIDEBAR_SECTION_KEYS.forEach((key) => {
        const tab = document.getElementById(SIDEBAR_TAB_IDS[key]);
        if (!tab) return;
        const isActive = key === sectionKey;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    if (openSidebar) toggleSidebar(true);

    syncSidebarTriggerState(sectionKey, sidebar.classList.contains('open') || openSidebar);
    return true;
}

/**
 * Sync sidebar-linked triggers and section panels for tasks and standing.
 * @param {string|null} activeKey active sidebar section key.
 * @param {boolean} sidebarOpen whether the sidebar is open.
 */
function syncSidebarTriggerState(activeKey, sidebarOpen) {
    if (!shouldRouteToSidebar()) return;
    const mandatesTriggers = document.querySelectorAll('[data-mandates-trigger]');
    mandatesTriggers.forEach((trigger) => {
        trigger.setAttribute('aria-expanded', sidebarOpen && activeKey === 'tasks' ? 'true' : 'false');
    });
    const reputationTriggers = document.querySelectorAll('[data-reputation-trigger]');
    reputationTriggers.forEach((trigger) => {
        trigger.setAttribute('aria-expanded', sidebarOpen && activeKey === 'standing' ? 'true' : 'false');
    });
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
    const isPaintClaimModeActive = () => {
        if (typeof game.isPaintClaimModeActive === 'function') return game.isPaintClaimModeActive();
        const snapshot = game.settingsService?.getSnapshot?.();
        if (snapshot?.general) return snapshot.general.paintToClaim === true;
        if (typeof game.getGeneralSettings === 'function') return game.getGeneralSettings().paintToClaim === true;
        return game.paintClaimMode === true;
    };
    const onDown = (x, y) => {
        isDrag = true;
        start = { x, y };
        camStart = { x: game.cam.x, y: game.cam.y };
        if (isPaintClaimModeActive() && typeof game.onPaint === 'function') game.onPaint(x, y);
    };
    const onMove = (x, y) => {
        if (isDrag) {
            if (isPaintClaimModeActive() && typeof game.onPaint === 'function') {
                game.onPaint(x, y);
            } else {
                game.cam.x = camStart.x + (x - start.x);
                game.cam.y = camStart.y + (y - start.y);
            }
        }
        else if (typeof game.onHover === 'function') { game.onHover(x, y); }
    };
    const onUp = (x, y) => {
        if (isDrag) {
            isDrag = false;
            if (isPaintClaimModeActive()) {
                if (typeof game.resetPaintClaimDrag === 'function') game.resetPaintClaimDrag();
                return;
            }
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
    game.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        setCameraZoom(game, game.cam.zoom - e.deltaY * 0.001);
    }, { passive: false });
}

function toggleSidebar(forceState) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', shouldOpen);
    document.body.classList.toggle('sidebar-open', shouldOpen);
    if (shouldOpen && !getActiveSidebarKey()) setSidebarSection('stats', { openSidebar: false });
    syncSidebarTriggerState(getActiveSidebarKey(), shouldOpen);
}

/**
 * Toggle the mobile overview panel that groups Tasks and Factions triggers.
 * @param {boolean} [forceState] optional explicit open/close state.
 * @returns {boolean} true if the panel is now open.
 */
function toggleOverviewPanel(forceState) {
    const panel = document.getElementById('overview-panel');
    const toggle = document.getElementById('btn-overview');
    if (!panel || !toggle) return false;
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !panel.classList.contains('open');
    panel.classList.toggle('open', shouldOpen);
    panel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    return shouldOpen;
}

/**
 * Toggle the mandates section of the sidebar for task awareness.
 * @param {boolean} [forceState] optional explicit open/close state.
 */
function toggleMandatesPanel(forceState) {
    if (!shouldRouteToSidebar()) {
        return toggleTopBarPanel({
            panelId: 'mandates-panel',
            triggerSelector: '[data-mandates-trigger]',
            forceState,
            onOpen: () => renderMandatesPanel()
        });
    }
    const sidebar = document.getElementById('sidebar');
    const isOpen = sidebar?.classList?.contains('open');
    const isActive = getActiveSidebarKey() === 'tasks';
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !(isOpen && isActive);
    if (shouldOpen) {
        renderMandatesPanel();
        setSidebarSection('tasks', { openSidebar: true });
    } else if (isOpen && isActive) {
        toggleSidebar(false);
    }
    return shouldOpen;
}

const FACTION_DEFINITIONS = [
    { key: 'crown', name: 'Royalists', subtitle: 'Crown' },
    { key: 'reformers', name: 'Reformers', subtitle: 'Council' },
    { key: 'guilds', name: 'Business', subtitle: 'Guilds' },
    { key: 'masses', name: 'The Masses', subtitle: 'Settlers' },
    { key: 'frontier', name: 'Unaligned', subtitle: 'Frontier' }
];
const DEFAULT_FACTION_STANDINGS = {
    crown: 50,
    reformers: 50,
    guilds: 50,
    masses: 50,
    frontier: 50
};

/**
 * Toggle the faction reputation section inside the command sidebar.
 * @param {object} game live game singleton.
 * @param {boolean} [forceState] optional explicit open/close state.
 */
function toggleReputationPanel(game, forceState) {
    if (!shouldRouteToSidebar()) {
        return toggleTopBarPanel({
            panelId: 'reputation-panel',
            triggerSelector: '[data-reputation-trigger]',
            forceState,
            onOpen: () => renderReputationPanel(game)
        });
    }
    const sidebar = document.getElementById('sidebar');
    const isOpen = sidebar?.classList?.contains('open');
    const isActive = getActiveSidebarKey() === 'standing';
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !(isOpen && isActive);
    if (shouldOpen) {
        renderReputationPanel(game);
        setSidebarSection('standing', { openSidebar: true });
    } else if (isOpen && isActive) {
        toggleSidebar(false);
    }
    return shouldOpen;
}

/**
 * Toggle a top-bar flyout panel and keep trigger accessibility in sync.
 * @param {{ panelId: string, triggerSelector: string, forceState?: boolean, onOpen?: () => void }} options
 * @returns {boolean} true when the panel is now open.
 */
function toggleTopBarPanel({ panelId, triggerSelector, forceState, onOpen }) {
    if (typeof document === 'undefined') return false;
    const panel = document.getElementById(panelId);
    if (!panel) return false;
    const isOpen = panel.classList?.contains?.('open');
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !isOpen;
    if (shouldOpen && typeof onOpen === 'function') onOpen();
    panel.classList?.toggle?.('open', shouldOpen);
    panel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    document.querySelectorAll(triggerSelector).forEach((trigger) => {
        trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    });
    return shouldOpen;
}

/**
 * Hash a string into a stable 32-bit seed for deterministic tooltips.
 * @param {string} value seed input.
 * @returns {number} unsigned 32-bit hash.
 */
function hashStringToSeed(value) {
    let hash = 2166136261;
    for (let idx = 0; idx < value.length; idx += 1) {
        hash ^= value.charCodeAt(idx);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

/**
 * Create a simple seeded RNG to keep placeholder tooltip text stable.
 * @param {string|number} seed stable seed input.
 * @returns {{ next: () => number }} RNG that returns floats in [0, 1).
 */
function createSeededRng(seed) {
    let state = typeof seed === 'number' ? seed : hashStringToSeed(String(seed));
    state = state >>> 0;
    return {
        next: () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        }
    };
}

function pickFromList(list, rng) {
    if (!Array.isArray(list) || list.length === 0) return '';
    const index = Math.floor(rng.next() * list.length);
    return list[Math.min(Math.max(index, 0), list.length - 1)];
}

function getNarrativeFactionLines(game) {
    if (!game?.narrative || typeof game.narrative.getRecentBeats !== 'function') return [];
    const beats = game.narrative.getRecentBeats('faction');
    if (!Array.isArray(beats)) return [];
    const lines = [];
    beats.forEach((beat) => {
        if (!beat) return;
        if (Array.isArray(beat.lines)) {
            beat.lines.forEach((line) => {
                if (line) lines.push(String(line));
            });
        } else if (typeof beat === 'string') {
            lines.push(beat);
        } else if (typeof beat.line === 'string') {
            lines.push(beat.line);
        }
    });
    return lines;
}

function countRebelCamps(game) {
    let count = 0;
    const hexes = game?.overworld?.hexes;
    if (hexes && typeof hexes.forEach === 'function') {
        hexes.forEach((tile) => {
            const type = typeof tile?.type === 'string' ? tile.type.toLowerCase() : '';
            if (type === 'rebelcamp' || tile?.isRebelCamp) count += 1;
        });
    }
    return count;
}

function describeStanding(value) {
    if (value <= 20) return 'Hostile';
    if (value <= 40) return 'Wary';
    if (value <= 60) return 'Neutral';
    if (value <= 80) return 'Supportive';
    return 'Loyal';
}

/**
 * Resolve the current campaign level using the shared enemy-level helper.
 * @param {object} game live game singleton.
 * @returns {number} normalized campaign level.
 */
function resolveCampaignLevel(game) {
    return resolveEnemyLevel(game);
}

function buildMandateContributor(game, rng) {
    const favor = clampImperialFavor(
        Number.isFinite(game?.imperialFavor) ? game.imperialFavor : DEFAULT_IMPERIAL_FAVOR
    );
    if (favor >= 8) {
        return pickFromList(['ahead of schedule', 'praised for swift compliance', 'earning steady commendations'], rng);
    }
    if (favor <= 3) {
        return pickFromList(['behind on quotas', 'flagged for missed deadlines', 'lagging on imperial demands'], rng);
    }
    return pickFromList(['tracking with modest compliance', 'steady but cautious', 'meeting the baseline mandate'], rng);
}

function buildTaxContributor(game, rng) {
    const level = resolveCampaignLevel(game);
    if (level >= 4) {
        return pickFromList(['levies escalating', 'stewards report heavy collections', 'tax collectors remain insistent'], rng);
    }
    if (level <= 1) {
        return pickFromList(['levies light', 'collections remain tempered', 'tax pressure easing'], rng);
    }
    return pickFromList(['steady tithes', 'collections holding at expected rates', 'tax caravans running on schedule'], rng);
}

function buildWarContributor(game, rng) {
    const warsWon = Number.isFinite(game?.stats?.warsWon) ? game.stats.warsWon : 0;
    const warsFought = Number.isFinite(game?.stats?.warsFought) ? game.stats.warsFought : 0;
    if (!warsFought) {
        return pickFromList(['no campaigns yet', 'wartime ledgers remain empty', 'garrisons await first clash'], rng);
    }
    return `${warsWon}/${warsFought} victories recorded`;
}

function buildRebelContributor(game, rng) {
    const rebelCamps = countRebelCamps(game);
    if (!rebelCamps) {
        return pickFromList(['no camps reported', 'patrols report a quiet frontier', 'insurgents scattered'], rng);
    }
    return `${rebelCamps} active camp${rebelCamps === 1 ? '' : 's'} tracked`;
}

function buildFactionTooltip({ faction, standingValue, game }) {
    const seed = `${faction.key}|${game?.timekeeper?.ticks ?? 0}|${game?.imperialFavor ?? 0}|${game?.stats?.warsWon ?? 0}|${game?.stats?.warsFought ?? 0}`;
    const rng = createSeededRng(seed);
    const standingLabel = describeStanding(standingValue);
    const narrativeLines = getNarrativeFactionLines(game);
    const recentBrief = narrativeLines.length ? pickFromList(narrativeLines, rng) : null;
    const lines = [
        `${faction.name} standing: ${standingLabel} (${standingValue}/100)`,
        `Mandate compliance: ${buildMandateContributor(game, rng)}`,
        `Tax pressure: ${buildTaxContributor(game, rng)}`,
        `War outcomes: ${buildWarContributor(game, rng)}`,
        `Rebel suppression: ${buildRebelContributor(game, rng)}`
    ];
    if (recentBrief) lines.push(`Recent brief: ${recentBrief}`);
    return lines.join('\n');
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

function formatResourceProgress(resource) {
    const current = Number.isFinite(resource.current) ? resource.current : 0;
    const target = Number.isFinite(resource.target) ? resource.target : 0;
    const unit = resource.unit ? ` ${resource.unit}` : '';
    return `${current}/${target}${unit}`;
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
        const resourceRequirements = Array.isArray(mandate.resourceRequirements) ? mandate.resourceRequirements : [];
        const hasResources = resourceRequirements.length > 0;

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
        if (hasResources) {
            const resources = document.createElement('div');
            resources.className = 'mandate-card__resources';

            resourceRequirements.forEach((resource) => {
                const row = document.createElement('div');
                row.className = 'mandate-card__resource';

                const label = document.createElement('span');
                label.className = 'mandate-card__resource-label';
                label.innerText = resource.label || 'Resource';

                const progress = document.createElement('span');
                progress.className = 'mandate-card__resource-progress';
                progress.innerText = formatResourceProgress(resource);

                row.appendChild(label);
                row.appendChild(progress);
                resources.appendChild(row);
            });

            if (mandate.resourceReady && !mandate.resourceConfirmed) {
                const confirm = document.createElement('button');
                confirm.type = 'button';
                confirm.className = 'mandate-card__confirm';
                confirm.innerText = 'Send';
                confirm.onclick = () => {
                    const result = api?.confirmMandateResources?.(mandate.id);
                    if (result?.ok) renderMandatesPanel();
                };
                resources.appendChild(confirm);
            }

            card.appendChild(resources);
        }
        card.appendChild(footer);
        list.appendChild(card);
    });

    body.appendChild(list);
    return activeMandates;
}

/**
 * Render the faction reputation panel with current standings and tooltip context.
 * Falls back to deterministic placeholders when narrative output is unavailable.
 * @param {object} game live game singleton for state and narrative context.
 * @returns {Array<object>} faction entries rendered for tests and debugging.
 */
export function renderReputationPanel(game) {
    if (typeof document === 'undefined') return [];
    const body = document.getElementById('reputation-panel-body');
    if (!body) return [];

    const standings = game?.factionState?.standings || {};
    const resolvedStandings = {
        crown: Number.isFinite(standings.crown) ? standings.crown : DEFAULT_FACTION_STANDINGS.crown,
        reformers: Number.isFinite(standings.reformers) ? standings.reformers : DEFAULT_FACTION_STANDINGS.reformers,
        guilds: Number.isFinite(standings.guilds) ? standings.guilds : DEFAULT_FACTION_STANDINGS.guilds,
        masses: Number.isFinite(standings.masses) ? standings.masses : DEFAULT_FACTION_STANDINGS.masses,
        frontier: Number.isFinite(standings.frontier) ? standings.frontier : DEFAULT_FACTION_STANDINGS.frontier
    };

    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'reputation-panel__list';

    const rendered = [];
    FACTION_DEFINITIONS.forEach((faction) => {
        const value = Math.max(0, Math.min(100, Math.round(resolvedStandings[faction.key] ?? 50)));

        const row = document.createElement('div');
        row.className = 'reputation-row';
        row.setAttribute('title', buildFactionTooltip({ faction, standingValue: value, game }));

        const label = document.createElement('div');
        label.className = 'reputation-row__label';

        const name = document.createElement('span');
        name.className = 'reputation-row__name';
        name.innerText = faction.name;

        const subtitle = document.createElement('span');
        subtitle.className = 'reputation-row__subtitle';
        subtitle.innerText = faction.subtitle;

        label.appendChild(name);
        label.appendChild(subtitle);

        const bar = document.createElement('div');
        bar.className = 'reputation-row__bar';

        const fill = document.createElement('div');
        fill.className = 'reputation-row__bar-fill';
        fill.style.width = `${value}%`;
        bar.appendChild(fill);

        const valueLabel = document.createElement('span');
        valueLabel.className = 'reputation-row__value';
        valueLabel.innerText = `${value}`;

        row.appendChild(label);
        row.appendChild(bar);
        row.appendChild(valueLabel);

        list.appendChild(row);
        rendered.push({ faction: faction.key, value });
    });

    body.appendChild(list);
    return rendered;
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

function toggleResearch(game, forceOpen) {
    if (!game.hudDrawer) game.hudDrawer = createHudDrawerController(game);
    const controller = game.hudDrawer;
    if (!controller) return;
    const shouldOpen = forceOpen === false ? false : true;
    if (!shouldOpen) {
        controller.hideIfActive?.('research');
        return;
    }
    controller.showResearch?.();
}

const LAND_RECLAMATION_LABELS = {
    forest: 'Plant Forest',
    town: 'Raise City'
};

const formatReclamationTargetLabel = (targetId, fallback = 'Upgrade') =>
    LAND_RECLAMATION_LABELS[targetId] || fallback;

/**
 * Rebuild the research modal using the shared card visuals so tech options mirror
 * the upgrade screen, including hover/active feedback and unified cost badges.
 * @param {object} game live game singleton exposing research state and helpers.
 */
function updateResearchUI(game) {
    const grid = document.getElementById('tech-grid');
    if (!grid) return;
    grid.innerHTML = '';
    syncHudDrawerHeader('research', game);

    const applyPurchaseAffordability = (btn, canAfford) => {
        if (!btn) return;
        const affordableState = Boolean(canAfford);
        btn.classList.toggle('affordable', affordableState);
        btn.classList.toggle('unaffordable', !affordableState);
    };

    const livesTech = game.getTech('lives');
    const livesCap = livesTech?.maxPurchases || 3;
    const livesLabel = document.getElementById('hud-drawer-lives');
    if (livesLabel) {
        livesLabel.innerText = `❤️ ${game.research.lives}/${livesCap}`;
        livesLabel.setAttribute('aria-hidden', 'false');
        livesLabel.style.display = 'inline-flex';
    }
    const headerLives = document.getElementById('lives-count');
    if (headerLives) headerLives.innerText = game.research.lives;


    game.research.technologies.forEach((tech) => {
        const card = document.createElement('article');
        card.className = 'tech-card command-card upgrade-strip';

        const row = document.createElement('div');
        row.className = 'upgrade-strip__row upgrade-row--header tech-row';

        const title = document.createElement('h3');
        title.className = 'upgrade-strip__title tech-title';
        const titleSuffix = tech.maxPurchases && tech.maxPurchases > 1
            ? ` (${tech.timesPurchased}/${tech.maxPurchases})`
            : '';
        title.innerText = `${tech.name}${titleSuffix}`;

        const controls = document.createElement('div');
        controls.className = 'tech-row__actions';

        const canBuyMore = ResearchSystem.hasRemainingPurchases(tech);
        const purchaseIndexLabel = tech.maxPurchases && tech.maxPurchases > 1
            ? `${tech.timesPurchased + 1}/${tech.maxPurchases}`
            : '';
        let affordable = false;

        if (tech.costOptions && tech.costOptions.length > 0) {
            const isLandReclamation = tech.id === 'land-reclamation';
            const optionLabelOverrides = isLandReclamation
                ? LAND_RECLAMATION_LABELS
                : null;
            const getOptionCost = (optionId) => game.getTechCost(tech, optionId);
            const optionPicker = document.createElement('div');
            optionPicker.className = 'tech-options option-stack';
            let selectedOptionId = null;
            const optionButtons = new Map();
            const optionLabels = new Map();
            const optionLabelNodes = new Map();
            const optionPriceNodes = new Map();

            const hasAffordableOption = tech.costOptions.some((opt) => {
                const optCost = getOptionCost(opt.id);
                return optCost
                    && (tech.id !== 'land-reclamation' || game.hasFieldToConvert())
                    && game.canPayCost(optCost);
            });

            const purchaseBtn = document.createElement('button');
            purchaseBtn.classList.add('card-btn', 'primary-btn', 'tech-purchase-btn');
            purchaseBtn.disabled = true;

            const formatPurchaseLabel = (costLabel) => {
                const suffix = purchaseIndexLabel ? ` ${purchaseIndexLabel}` : '';
                if (!costLabel) return 'Select option';
                return `Purchase${suffix ? ` ${suffix}` : ''} (${costLabel})`;
            };

            const applyOptionAffordability = (btn, canAfford) => {
                if (!btn) return;
                const affordableState = Boolean(canAfford);
                btn.classList.toggle('affordable', affordableState);
                btn.classList.toggle('unaffordable', !affordableState);
            };

            const updateOptionButtons = () => {
                tech.costOptions.forEach((opt) => {
                    const optBtn = optionButtons.get(opt.id);
                    if (!optBtn) return;
                    const optLabel = optionLabelNodes.get(opt.id);
                    const optPrice = optionPriceNodes.get(opt.id);
                    const cost = getOptionCost(opt.id);
                    const canAfford = cost
                        && canBuyMore
                        && (tech.id !== 'land-reclamation' || game.hasFieldToConvert())
                        && game.canPayCost(cost);
                    const isSelected = selectedOptionId === opt.id;
                    const baseLabel = optionLabels.get(opt.id) || opt.label;
                    const optionCostLabel = cost ? game.formatCost(cost) : '';
                    optBtn.classList.toggle('active', isSelected);
                    optBtn.classList.toggle('confirm', isSelected);
                    optBtn.classList.toggle('option-btn--selected', isSelected);
                    if (optLabel) optLabel.innerText = baseLabel;
                    if (optPrice) {
                        optPrice.innerText = (isLandReclamation && !isSelected) ? '' : optionCostLabel;
                    }
                    optBtn.title = baseLabel;
                    if (isLandReclamation) {
                        if (isSelected) {
                            applyOptionAffordability(optBtn, canAfford);
                        } else {
                            optBtn.classList.remove('affordable', 'unaffordable');
                        }
                    } else {
                        applyOptionAffordability(optBtn, canAfford);
                    }
                });
            };

            const updateOptionState = () => {
                const hasSelection = Boolean(selectedOptionId);
                const pricedCost = hasSelection ? getOptionCost(selectedOptionId) : null;
                const canAfford = pricedCost
                    && canBuyMore
                    && (tech.id !== 'land-reclamation' || game.hasFieldToConvert())
                    && game.canPayCost(pricedCost);
                const costLabel = pricedCost ? game.formatCost(pricedCost) : '';
                if (isLandReclamation) {
                    const shouldConfirm = Boolean(hasSelection && canAfford);
                    purchaseBtn.hidden = !shouldConfirm;
                    purchaseBtn.disabled = !shouldConfirm;
                    purchaseBtn.setAttribute('aria-hidden', shouldConfirm ? 'false' : 'true');
                    if (shouldConfirm) {
                        purchaseBtn.title = '';
                    } else if (!hasSelection) {
                        purchaseBtn.title = 'Choose an option first';
                    } else {
                        purchaseBtn.title = 'Option is not affordable';
                    }
                    purchaseBtn.innerText = 'Confirm';
                    if (shouldConfirm) {
                        applyPurchaseAffordability(purchaseBtn, true);
                    } else {
                        purchaseBtn.classList.remove('affordable', 'unaffordable');
                    }
                } else {
                    purchaseBtn.disabled = !canAfford;
                    applyPurchaseAffordability(purchaseBtn, canAfford);
                    purchaseBtn.title = selectedOptionId ? '' : 'Choose an option first';
                    purchaseBtn.innerText = formatPurchaseLabel(costLabel);
                }
                affordable = (hasAffordableOption && canBuyMore) || canAfford;
                updateOptionButtons();
            };

            tech.costOptions.forEach((opt) => {
                const optBtn = document.createElement('button');
                const baseLabel = optionLabelOverrides?.[opt.id] || opt.label;
                const labelSpan = document.createElement('span');
                const priceSpan = document.createElement('span');
                optionLabels.set(opt.id, baseLabel);
                labelSpan.className = 'option-btn__label';
                priceSpan.className = 'option-btn__price';
                labelSpan.innerText = baseLabel;
                optBtn.classList.add('card-btn', 'primary-btn', 'option-btn');
                optBtn.appendChild(labelSpan);
                optBtn.appendChild(priceSpan);
                optBtn.onclick = () => {
                    selectedOptionId = opt.id;
                    updateOptionState();
                };
                optionButtons.set(opt.id, optBtn);
                optionLabelNodes.set(opt.id, labelSpan);
                optionPriceNodes.set(opt.id, priceSpan);
                optionPicker.appendChild(optBtn);
            });

            purchaseBtn.onclick = () => {
                if (!selectedOptionId) return;
                game.buyTechnology(tech.id, selectedOptionId);
            };

            controls.appendChild(optionPicker);
            controls.appendChild(purchaseBtn);
            updateOptionState();
        } else {
            const cost = game.getTechCost(tech);
            const costLabel = game.formatCost(cost);
            const btn = document.createElement('button');
            btn.classList.add('card-btn', 'primary-btn', 'tech-purchase-btn');
            btn.innerText = purchaseIndexLabel
                ? `Purchase ${purchaseIndexLabel} (${costLabel})`
                : `Purchase (${costLabel})`;
            affordable = game.canPayCost(cost) && canBuyMore;
            btn.disabled = !affordable;
            applyPurchaseAffordability(btn, affordable);
            btn.onclick = () => game.buyTechnology(tech.id);
            controls.appendChild(btn);
        }

        row.appendChild(title);
        row.appendChild(controls);

        const desc = document.createElement('p');
        desc.className = 'upgrade-strip__desc upgrade-row--desc tech-desc';
        desc.innerText = tech.description;

        card.appendChild(row);
        card.appendChild(desc);

        if (tech.maxPurchases && tech.maxPurchases > 1) {
            const scale = document.createElement('p');
            scale.className = 'upgrade-strip__scale upgrade-row--scale tech-scale';
            scale.innerText = `Scales ×${Math.max(tech.growthFactor || 1, 1).toFixed(2)} per purchase.`;
            card.appendChild(scale);
        }

        if (!canBuyMore) {
            card.classList.add('purchased');
            controls.querySelectorAll('button').forEach((btn) => {
                btn.disabled = true;
            });
            const purchaseBtn = card.querySelector('.tech-purchase-btn');
            if (purchaseBtn) {
                purchaseBtn.classList.remove('affordable', 'unaffordable');
                purchaseBtn.classList.add('purchased-btn');
                purchaseBtn.innerText = 'Purchased';
                purchaseBtn.title = 'Already purchased';
            }
        } else if (affordable) {
            card.classList.add('affordable');
        } else {
            card.classList.add('unaffordable');
        }

        grid.appendChild(card);
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

/**
 * Synchronize the sidebar Settings UI with the live audio/visual preferences
 * so sliders and toggles always mirror the current runtime state.
 * @param {object} game live game singleton
 */
export function updateSettingsUI(game) {
    const snapshot = game.settingsService?.getSnapshot?.();
    const audioSettings = snapshot?.audio
        || (typeof game.getAudioSettings === 'function' ? game.getAudioSettings() : { master: 1, music: 1, sfx: 1 });
    const clampPercent = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
    document.querySelectorAll('[data-audio-setting]').forEach((input) => {
        const key = input.dataset.audioSetting;
        const normalized = clampPercent(audioSettings[key]);
        const percent = Math.round(normalized * 100);
        input.value = percent;
        const readout = document.querySelector(`[data-audio-readout="${key}"]`);
        if (readout) readout.innerText = `${percent}%`;
    });

    const visuals = snapshot?.visuals
        || (typeof game.getVisualSettings === 'function' ? game.getVisualSettings() : {});
    syncToggleInputs({
        selector: '[data-visual-toggle]',
        datasetKey: 'visualToggle',
        values: visuals
    });

    const general = snapshot?.general
        || (typeof game.getGeneralSettings === 'function' ? game.getGeneralSettings() : {});
    syncToggleInputs({
        selector: '[data-general-toggle]',
        datasetKey: 'generalToggle',
        values: general
    });
}

const UPGRADE_COPY = {
    soldier: {
        title: 'Soldier Power ⚔️',
        description: 'Sharpen drills and gear to boost your infantry squads.',
        scale: (level) => {
            const scaledLevel = Math.max(1, Number(level) || 1);
            const multi = 1 + ((scaledLevel - 1) * 0.2);
            return `+20% soldier HP & damage per level (Current ×${multi.toFixed(2)})`;
        }
    },
    archer: {
        title: 'Archer Power 🏹',
        description: 'Upgrade fletching, bows, and drills to keep volleys lethal.',
        scale: (level) => {
            const scaledLevel = Math.max(1, Number(level) || 1);
            const multi = 1 + ((scaledLevel - 1) * 0.2);
            return `+20% archer HP & damage per level (Current ×${multi.toFixed(2)})`;
        }
    },
    production: {
        title: 'Production Speed ⚡',
        description: 'Optimize barracks output and rally timing for faster deployments.',
        scale: (level) => {
            const scaledLevel = Math.max(1, Number(level) || 1);
            const multi = Math.pow(0.9, scaledLevel - 1);
            return `-10% training time per level (Current ×${multi.toFixed(2)})`;
        }
    },
    mines: {
        title: 'Mine Efficiency 🏭',
        description: 'Automate ore lines to compound passive gold between assaults.',
        scale: (level) => {
            const scaledLevel = Math.max(1, Number(level) || 1);
            const multi = 1 + ((scaledLevel - 1) * 0.2);
            return `+20% income per level (Current ×${multi.toFixed(2)})`;
        }
    },
    defense: {
        title: 'Defense Systems 🛡️',
        description: 'Reinforce walls and keep defensive emplacements deadly.',
        scale: (level) => {
            const scaledLevel = Math.max(1, Number(level) || 1);
            const multi = 1 + ((scaledLevel - 1) * 0.25);
            return `+25% castle & tower HP/damage per level (Current ×${multi.toFixed(2)})`;
        }
    }
};

const ULTIMATE_DRAWER_ENTRIES = [
    { id: 'rush', buttonId: 'buy-ultimate-rush' },
    { id: 'manpower', buttonId: 'buy-ultimate-manpower' },
    { id: 'gold', buttonId: 'buy-ultimate-gold' }
];

const formatSeconds = (ms) => `${Math.max(0, Math.round(ms / 1000))}s`;

/**
 * Build the effect summary line for an ultimate at the provided level.
 * @param {string} ultimateId ultimate identifier.
 * @param {number} level current level to describe.
 * @returns {string} human-readable effect summary.
 */
function buildUltimateEffectSummary(ultimateId, level) {
    if (ultimateId === 'rush') {
        const speedMultiplier = resolveUltimateLevelValue(ULTIMATE_CONFIG.rush.speedMultiplier, level);
        const duration = getUltimateDurationMs('rush', level);
        const percent = Math.round((speedMultiplier - 1) * 100);
        return `Rush: +${percent}% speed for ${formatSeconds(duration)}.`;
    }
    if (ultimateId === 'manpower') {
        const spawnMultiplier = resolveUltimateLevelValue(ULTIMATE_CONFIG.manpower.spawnRateMultiplier, level);
        const doubleChance = resolveUltimateLevelValue(ULTIMATE_CONFIG.manpower.doubleSpawnChance, level);
        const duration = getUltimateDurationMs('manpower', level);
        const percent = Math.round((1 - spawnMultiplier) * 100);
        const chance = Math.round(doubleChance * 100);
        return `Manpower: +${percent}% spawn speed with ${chance}% double spawns for ${formatSeconds(duration)}.`;
    }
    if (ultimateId === 'gold') {
        const cullPercent = resolveUltimateLevelValue(ULTIMATE_CONFIG.gold.unitCullPercent, level);
        const goldPerUnit = resolveUltimateLevelValue(ULTIMATE_CONFIG.gold.goldPerUnit, level);
        const percent = Math.round(cullPercent * 100);
        return `Gold: cull ${percent}% of standing units for ${goldPerUnit}g each.`;
    }
    return '';
}

/**
 * Refresh the ultimate drawer so level readouts, effect text, and purchase
 * buttons reflect the player's current gold and ultimate levels.
 * @param {object} game live game singleton containing ultimate levels and gold.
 */
function updateUltimatesMenu(game) {
    if (typeof document === 'undefined') return;
    const ensureText = (el, text) => { if (el && typeof text === 'string') el.innerText = text; };
    const resolvedSelection = resolveUltimateSelection(game.selectedUltimate);

    ULTIMATE_DRAWER_ENTRIES.forEach(({ id, buttonId }) => {
        const btn = document.querySelector(`[data-ultimate-button="${id}"]`) || document.getElementById(buttonId);
        const selectBtn = document.querySelector(`[data-ultimate-select="${id}"]`)
            || document.getElementById(`select-ultimate-${id}`);
        const statusEl = document.getElementById(`ultimate-${id}-status`);
        const levelEl = document.querySelector(`[data-ultimate-level="${id}"]`) || document.getElementById(`ultimate-${id}-meta`);
        const effectEl = document.querySelector(`[data-ultimate-effect="${id}"]`) || document.getElementById(`ultimate-${id}-effect`);

        const level = Number.isFinite(game.ultimates?.[id])
            ? Math.max(1, game.ultimates[id])
            : (DEFAULT_ULTIMATE_LEVELS[id] ?? 1);
        const maxLevel = getUltimateMaxLevel(id);
        const nextLevel = Math.min(level + 1, maxLevel);
        const cost = typeof game.getUltimateUpgradeCost === 'function'
            ? game.getUltimateUpgradeCost(id)
            : getUltimateUpgradeCost(id, level);
        const atMax = level >= maxLevel;
        const costLabel = cost !== null ? `${cost}g` : 'MAX';
        const canAfford = !atMax && (Number.isFinite(game.gold) ? game.gold : 0) >= (cost ?? 0);

        ensureText(statusEl, atMax ? `Max ${level}` : `Level ${level}`);
        ensureText(levelEl, `Level ${level} of ${maxLevel}`);
        ensureText(effectEl, buildUltimateEffectSummary(id, level));

        if (!btn) return;
        const label = btn.querySelector('[data-ultimate-label]');
        const costEl = btn.querySelector('[data-ultimate-cost]');
        const labelText = atMax ? 'Max Level' : `Upgrade Lv.${nextLevel}`;
        const ariaLabel = atMax
            ? `${ULTIMATE_CONFIG[id]?.label || id} ultimate maxed`
            : `${labelText} costs ${costLabel}`;

        if (label || costEl) {
            if (label) label.innerText = atMax ? labelText : (canAfford ? labelText : '');
            if (costEl) costEl.innerText = costLabel;
            btn.setAttribute('aria-label', ariaLabel);
        } else {
            btn.innerText = atMax ? labelText : `${labelText} (${costLabel})`;
        }

        btn.disabled = atMax || !canAfford;
        btn.classList.toggle('affordable', canAfford && !atMax);
        btn.classList.toggle('unaffordable', !canAfford || atMax);
        btn.title = atMax ? 'Max level reached' : (canAfford ? '' : 'Insufficient gold');

        if (selectBtn) {
            const isSelected = id === resolvedSelection;
            const ultimateLabel = ULTIMATE_CONFIG[id]?.label || id;
            selectBtn.disabled = isSelected;
            selectBtn.classList.toggle('ultimate-select-btn--active', isSelected);
            selectBtn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            selectBtn.setAttribute(
                'aria-label',
                isSelected ? `${ultimateLabel} selected for battle` : `Select ${ultimateLabel} for battle`
            );
            selectBtn.innerText = isSelected ? 'Selected' : 'Select';
            selectBtn.title = isSelected ? 'Selected for battle' : 'Pick this ultimate for combat';
        }
    });
}

/**
 * Refresh the upgrade drawer so titles, descriptions, scaling text, and purchase
 * buttons reflect the player's current gold and upgrade levels.
 * @param {object} game live game singleton containing upgrade levels and gold.
 */
function updateUpgradeMenu(game) {
    const definitions = [
        { id: 'soldier', buttonId: 'buy-soldier' },
        { id: 'archer', buttonId: 'buy-archer' },
        { id: 'production', buttonId: 'buy-prod' },
        { id: 'mines', buttonId: 'buy-mines' },
        { id: 'defense', buttonId: 'buy-defense' }
    ];

    const ensureText = (el, text) => { if (el && text) el.innerText = text; };

    definitions.forEach(({ id, buttonId }) => {
        const btn = document.querySelector(`[data-upgrade-button="${id}"]`) || document.getElementById(buttonId);
        const card = btn?.closest?.('[data-upgrade-card]') || document.querySelector(`[data-upgrade-card="${id}"]`);
        const titleEl = document.querySelector(`[data-upgrade-title="${id}"]`);
        const descEl = document.querySelector(`[data-upgrade-description="${id}"]`);
        const scaleEl = document.querySelector(`[data-upgrade-scale="${id}"]`);

        const level = Number.isFinite(game.upgrades?.[id]) ? Math.max(1, game.upgrades[id]) : 1;
        const nextLevel = level + 1;
        const cost = typeof game.getUpgradeCost === 'function' ? game.getUpgradeCost(id) : 0;
        const costLabel = `${cost}g`;
        const canAfford = (Number.isFinite(game.gold) ? game.gold : 0) >= cost;
        const copy = UPGRADE_COPY[id] || {};

        ensureText(titleEl, copy.title);
        ensureText(descEl, copy.description);
        const scaleText = typeof copy.scale === 'function' ? copy.scale(level) : copy.scale;
        ensureText(scaleEl, scaleText);

        if (!btn) return;

        const labelText = `Purchase Lv.${nextLevel}`;
        const combined = canAfford ? `${labelText} (${costLabel})` : costLabel;
        const label = btn.querySelector('[data-upgrade-label]');
        const costEl = btn.querySelector('[data-upgrade-cost]');

        if (label || costEl) {
            if (label) label.innerText = canAfford ? labelText : '';
            if (costEl) costEl.innerText = costLabel;
            btn.setAttribute('aria-label', canAfford ? combined : `Lv.${nextLevel} costs ${costLabel}`);
        } else {
            btn.innerText = combined;
        }

        btn.disabled = !canAfford;
        btn.classList.toggle('affordable', canAfford);
        btn.classList.toggle('unaffordable', !canAfford);
        btn.title = canAfford ? '' : 'Insufficient gold';
        if (card) {
            card.classList.toggle('affordable', canAfford);
            card.classList.toggle('unaffordable', !canAfford);
        }
    });
}

/**
 * Refresh the HUD resource slab with the latest overworld economy and imperial favor.
 * @param {object} game live game singleton exposing resource values and favor.
 */
export function updateHUD(game) {
    document.getElementById('gold').innerText = Math.floor(game.gold);
    document.getElementById('wood').innerText = Math.floor(game.wood);
    const lives = document.getElementById('lives-count');
    if (lives) lives.innerText = game.research.lives;
    const favorValue = clampImperialFavor(game.imperialFavor ?? DEFAULT_IMPERIAL_FAVOR);
    syncHudReadout({ id: 'imperial-favor', dataKey: 'imperial-favor', value: favorValue });
    const formatted = game.timekeeper?.formatCalendar?.() || 'M: Jan Y1 | W: 1/4 | D: 1/28';
    const weeksPerMonth = game.timekeeper?.weeksPerMonth || 4;
    const daysPerWeek = game.timekeeper?.daysPerWeek || 7;
    syncHudReadout({
        id: 'calendar-readout',
        dataKey: 'calendar',
        value: formatted,
        title: `${weeksPerMonth} weeks/month · ${daysPerWeek}-day weeks`
    });
    const pauseToggle = document.getElementById('btn-pause');
    if (pauseToggle) {
        pauseToggle.innerText = game.paused ? '▶️ Resume' : '⏸️ Pause';
        pauseToggle.setAttribute('aria-pressed', game.paused ? 'true' : 'false');
    }
    const pauseIndicator = document.getElementById('pause-indicator');
    if (pauseIndicator) {
        pauseIndicator.innerText = game.paused ? 'Paused' : 'Live';
        pauseIndicator.classList.toggle('paused', !!game.paused);
    }
    syncHudReadout({
        id: 'lvl-txt',
        dataKey: 'enemy-level',
        value: `Lv.${resolveCampaignLevel(game)}`
    });
    updateCombatUltimateHud(game);
}

/**
 * Update shared HUD readouts to keep sidebar mirrors synchronized.
 * @param {{ id: string, dataKey: string, value: string|number, title?: string }} config readout config.
 */
function syncHudReadout({ id, dataKey, value, title }) {
    const primary = document.getElementById(id);
    if (primary) {
        primary.innerText = value;
        if (title) primary.title = title;
    }
    if (typeof document.querySelectorAll === 'function') {
        document.querySelectorAll(`[data-hud-stat="${dataKey}"]`).forEach((node) => {
            node.innerText = value;
            if (title) node.title = title;
        });
    }
}

/**
 * Update the combat ultimate HUD ring, label, and timer for the active battle.
 * @param {object} game live game singleton exposing combat ultimate charge data.
 */
function updateCombatUltimateHud(game) {
    const hud = document.getElementById('combat-ultimate-hud');
    if (!hud) return;

    const inCombat = game.state === 'COMBAT';
    hud.classList.toggle('is-visible', inCombat);
    hud.setAttribute('aria-hidden', inCombat ? 'false' : 'true');
    if (!inCombat) return;

    const selectedId = resolveUltimateSelection(
        game?.combat?.ultimates?.selectedId
        || game?.selectedUltimate
        || hud.dataset.ultimateId
        || DEFAULT_ULTIMATE_SELECTION
    );
    if (hud.dataset.ultimateId !== selectedId) hud.dataset.ultimateId = selectedId;
    const ultimateId = hud.dataset.ultimateId;
    const ultimateConfig = ULTIMATE_CONFIG[ultimateId] || {};
    const ultimates = game?.combat?.ultimates || {};
    const readyAtMs = Number(ultimates.readyAtMs?.[ultimateId] ?? 0);
    const chargeMs = Number(ultimates.chargeMs?.[ultimateId] ?? 0);
    const consumed = Boolean(ultimates.consumed?.[ultimateId]);
    const activeEffect = ultimates.activeEffects?.[ultimateId];
    const warElapsedMs = Number(game?.combat?.warElapsedMs ?? 0);

    const ring = document.querySelector('#combat-ultimate-hud .ultimate-ring');
    const icon = document.getElementById('ultimate-icon');
    const label = document.getElementById('ultimate-label');
    const timer = document.getElementById('ultimate-timer');
    const button = document.getElementById('ultimate-button');

    let progress = readyAtMs > 0 ? Math.min(chargeMs / readyAtMs, 1) : 0;
    if (activeEffect && ultimateId !== 'gold') {
        const level = Number(ultimates.levels?.[ultimateId] ?? DEFAULT_ULTIMATE_LEVELS[ultimateId] ?? 1);
        const durationMs = getUltimateDurationMs(ultimateId, level);
        const activatedAtMs = Number(activeEffect.activatedAtMs ?? warElapsedMs);
        const elapsedActiveMs = Math.max(0, warElapsedMs - activatedAtMs);
        progress = durationMs > 0 ? Math.max(0, 1 - Math.min(elapsedActiveMs / durationMs, 1)) : 0;
    }
    if (ring?.style?.setProperty) ring.style.setProperty('--charge-progress', progress.toString());

    const ready = !consumed && progress >= 1;
    if (button) {
        button.classList.toggle('ultimate-button--ready', ready);
        button.classList.toggle('ultimate-button--active', Boolean(activeEffect));
        button.classList.toggle('ultimate-button--disabled', consumed);
        button.setAttribute('aria-disabled', consumed ? 'true' : 'false');
        const labelText = ultimateConfig.label || 'Ultimate';
        const stateLabel = consumed ? 'used' : ready ? 'ready' : 'charging';
        button.setAttribute('aria-label', `${labelText} ultimate ${stateLabel}`);
    }

    if (label) label.innerText = ultimateConfig.label || 'Ultimate';
    if (icon) icon.innerText = resolveUltimateIcon(ultimateId);

    if (timer) {
        const secondsRemaining = readyAtMs > 0 ? Math.max(0, Math.ceil((readyAtMs - chargeMs) / 1000)) : 0;
        timer.innerText = consumed ? 'Used' : ready ? 'Ready' : `${secondsRemaining}s`;
    }
}

function resolveUltimateIcon(ultimateId) {
    const icons = {
        rush: '⚡',
        manpower: '🪖',
        gold: '💰'
    };
    return icons[ultimateId] || '✨';
}

/**
 * Resolve the latest overworld tile payload for a selected tile reference.
 * Ensures UI affordances (like attack overlays) follow post-combat map updates.
 * @param {object} game live game singleton.
 * @param {object|null} tile selected tile payload.
 * @returns {object|null} most recent tile data when known.
 */
function resolveOverworldTile(game, tile) {
    if (!tile || !game?.overworld?.hexes) return tile;
    const key = getTileKey(tile);
    if (!key) return tile;
    return game.overworld.hexes.get(key) || tile;
}

/**
 * Update the tile inspector widget to surface contextual actions like Attack for hostile tiles.
 * @param {object} game live game singleton.
 * @param {object|null} tile currently selected overworld tile.
 */
function updateTileInspector(game, tile) {
    const panel = document.getElementById('tile-inspector');
    const label = document.getElementById('tile-inspector-label');
    const bonus = document.getElementById('tile-inspector-bonus');
    const adjacency = document.getElementById('tile-inspector-adjacency');
    const adjacencySummary = document.getElementById('tile-inspector-adjacency-summary');
    const adjacencyDetail = document.getElementById('tile-inspector-adjacency-detail');
    if (!panel || !label) return;

    const pendingReclamations = Array.isArray(game.pendingReclamations) ? game.pendingReclamations.length : 0;
    const pendingReclamationTarget = pendingReclamations && typeof game.nextQueuedReclamationType === 'function'
        ? game.nextQueuedReclamationType()
        : null;
    const pendingReclamationCost = pendingReclamations && typeof game.nextQueuedReclamationCost === 'function'
        ? game.nextQueuedReclamationCost()
        : null;
    const pendingCostLabel = pendingReclamationCost && typeof game.formatCost === 'function'
        ? game.formatCost(pendingReclamationCost)
        : (pendingReclamationCost?.gold ? `${pendingReclamationCost.gold}g` : '');
    const hasEligibleFields = typeof game.hasFieldToConvert === 'function'
        ? game.hasFieldToConvert()
        : true;
    const awaitingReclamation = pendingReclamations && game.awaitingReclamationTarget;

    const hideAdjacency = () => {
        if (adjacency) adjacency.style.display = 'none';
        if (adjacencySummary) adjacencySummary.innerText = '';
        if (adjacencyDetail) adjacencyDetail.innerText = '';
    };
    const showAdjacency = (summary, detail) => {
        if (adjacency) adjacency.style.display = 'block';
        if (adjacencySummary) adjacencySummary.innerText = summary || '';
        if (adjacencyDetail) adjacencyDetail.innerText = detail || '';
    };

    const shouldHide = game.state !== 'OVERWORLD';
    panel.classList.toggle('hidden', shouldHide);
    if (shouldHide) {
        game.updateTileAttackOverlay?.(null);
        if (bonus) {
            bonus.innerText = '';
            bonus.title = '';
        }
        hideAdjacency();
        return;
    }

    if (!tile) {
        label.innerText = 'Select a tile to inspect';
        panel.classList.remove('hostile');
        const placementCost = pendingCostLabel ? ` (${pendingCostLabel} due on placement)` : '';
        if (bonus) {
            bonus.classList.toggle('paused', !!game.paused);
            if (pendingReclamations) {
                const targetLabel = formatReclamationTargetLabel(pendingReclamationTarget, 'Upgrade');
                if (!hasEligibleFields) {
                    bonus.innerText = 'Reclamation paused: no player fields available to convert.';
                    bonus.title = 'Claim or reclaim neutral territory to free up a field target.';
                } else {
                    bonus.innerText = `Reclamation ready (${pendingReclamations}): select a field to build ${targetLabel}${placementCost}.`;
                    bonus.title = 'Gold will be charged when you confirm a valid placement.';
                }
            } else {
                bonus.innerText = game.paused
                    ? '⏸️ Paused — cluster bonuses frozen until you resume'
                    : 'Cluster bonuses appear when you select a tile.';
                bonus.title = '';
            }
        }
        const summary = pendingReclamations
            ? 'Land reclamation ready'
            : 'No adjacency bonuses yet.';
        const detail = pendingReclamations
            ? hasEligibleFields
                ? `Click a player-owned field to choose where the upgrade lands${placementCost ? `; ${pendingCostLabel} due` : ''}.`
                : 'No player fields remain — secure more territory to place the upgrade.'
            : 'Select a tile to reveal cluster effects.';
        showAdjacency(summary, detail);
        game.updateTileAttackOverlay?.(null);
        return;
    }

    const resolvedTile = resolveOverworldTile(game, tile);
    const claimCost = typeof resolvedTile.claimCost === 'number' ? resolvedTile.claimCost : null;
    const isRebelTile = RebelSystem?.isRebelCampTile?.(resolvedTile);
    const isHostile = !claimCost && (isRebelTile || resolvedTile.owner === 'enemy');
    const labelText = claimCost !== null
        ? 'Unclaimed Frontier'
        : resolvedTile.type
            ? resolvedTile.type.toString().replace(/-/g, ' ')
            : 'Unknown Tile';

    label.innerText = labelText.toUpperCase();
    panel.classList.toggle('hostile', !!isHostile);
    game.updateTileAttackOverlay?.(isHostile ? resolvedTile : null);

    if (bonus) {
        bonus.classList.toggle('paused', !!game.paused);
        if (claimCost !== null) {
            const currentWood = Math.max(0, Math.floor(game.wood ?? 0));
            const delta = Math.max(0, claimCost - currentWood);
            const affordability = delta > 0 ? `${delta} more wood needed` : 'Affordable now';
            bonus.innerText = `${claimCost}w to claim — ${affordability}`;
            bonus.title = `You have ${currentWood} wood available.`;
            hideAdjacency();
            return;
        }

        if (resolvedTile.owner === 'scorched') {
            const currentGold = Math.max(0, Math.floor(game.gold ?? 0));
            const delta = Math.max(0, SCORCHED_DOUSE_COST - currentGold);
            const affordability = delta > 0 ? `${delta} more gold needed` : 'Affordable now';
            bonus.innerText = `Scorched land — click to douse for ${SCORCHED_DOUSE_COST}g (${affordability}).`;
            bonus.title = `You have ${currentGold} gold available.`;
            hideAdjacency();
            return;
        }

        if (awaitingReclamation && resolvedTile.owner === 'enemy') {
            bonus.innerText = 'Enemy tile — reclaim a player field instead.';
            bonus.title = 'Land reclamation can only target neutral or player-owned fields.';
            hideAdjacency();
            return;
        }

        if (awaitingReclamation && resolvedTile.type !== 'field') {
            bonus.innerText = 'Reclamation ready: select a player-controlled field to convert.';
            bonus.title = 'Only fields can be upgraded via land reclamation.';
            hideAdjacency();
            return;
        }

        if (pendingReclamations && resolvedTile.type === 'field' && resolvedTile.owner !== 'enemy') {
            const targetLabel = formatReclamationTargetLabel(pendingReclamationTarget, 'Upgrade');
            const costLine = pendingCostLabel ? ` (${pendingCostLabel} on placement)` : '';
            bonus.innerText = `Reclaim ready: convert to ${targetLabel}${costLine}.`;
            bonus.title = 'Gold will be charged after selecting a valid player-owned field.';
            hideAdjacency();
            return;
        }

        const key = resolvedTile.hex?.toString?.() || `${resolvedTile.hex?.q ?? 0},${resolvedTile.hex?.r ?? 0}`;
        const clusterMap = game.overworld?.clusterBonuses;
        const cluster = key && clusterMap?.has(key) ? clusterMap.get(key) : resolvedTile.clusterBonus;
        if (game.featureToggles?.debug?.logAdjacency && cluster) {
            console.debug('Tile adjacency bonuses', { key, cluster });
        }
        const clusterSize = Number.isInteger(cluster?.size) ? cluster.size : 0;
        const isClustered = clusterSize >= 2;
        const resourceParts = [];
        if (cluster?.goldBonus) resourceParts.push(`+${cluster.goldBonus}g`);
        if (cluster?.woodBonus) resourceParts.push(`+${cluster.woodBonus}w`);
        const clusterLabel = isClustered ? `${clusterSize}-tile ${labelText.toLowerCase()} cluster` : 'No adjacency';
        const payload = resourceParts.length ? resourceParts.join(' ') : 'No bonus income';
        const pauseSuffix = game.paused ? ' (paused)' : '';
        bonus.innerText = `${payload} — ${clusterLabel}${pauseSuffix}`;

        const tooltipParts = [];
        if (isClustered) tooltipParts.push(`Cluster size ${clusterSize}`);
        if (isClustered && typeof cluster?.adjacencyRate === 'number')
            tooltipParts.push(`Adjacency ${(cluster.adjacencyRate * 100).toFixed(0)}%`);
        if (isClustered && typeof cluster?.reclamationRate === 'number')
            tooltipParts.push(`Reclamation ${(cluster.reclamationRate * 100).toFixed(0)}%`);
        if (isClustered && typeof cluster?.reverseAdjacencyMultiplier === 'number') {
            tooltipParts.push(`Distance efficiency ${(cluster.reverseAdjacencyMultiplier * 100).toFixed(0)}%`);
        }
        if (typeof cluster?.distanceFromCastle === 'number') {
            tooltipParts.push(`From castle: ${cluster.distanceFromCastle.toFixed(0)} hexes`);
        }
        bonus.title = tooltipParts.length ? tooltipParts.join(' • ') : 'No adjacency modifiers';

        const hasAdjacency = Boolean(cluster && (isClustered || cluster.totalRate || cluster.goldBonus || cluster.woodBonus));
        if (hasAdjacency) {
            const summary = resourceParts.length ? `Cluster bonuses: ${resourceParts.join(' ')}` : 'Cluster bonuses active';
            const rateParts = [];
            if (typeof cluster.totalRate === 'number') rateParts.push(`Total ${(cluster.totalRate * 100).toFixed(0)}%`);
            if (typeof cluster.adjacencyRate === 'number') rateParts.push(`Adjacency ${(cluster.adjacencyRate * 100).toFixed(0)}%`);
            if (typeof cluster.reclamationRate === 'number') rateParts.push(`Reclamation ${(cluster.reclamationRate * 100).toFixed(0)}%`);
            if (typeof cluster.reverseAdjacencyMultiplier === 'number') {
                rateParts.push(`Distance ${(cluster.reverseAdjacencyMultiplier * 100).toFixed(0)}%`);
            }
            const detailParts = [clusterLabel];
            if (rateParts.length) detailParts.push(rateParts.join(' • '));
            showAdjacency(summary, detailParts.join(' — '));
        } else {
            showAdjacency('No adjacency bonuses', 'Isolated tile — cluster effects unavailable.');
        }
    }
}

/**
 * Position the inline attack control directly on the selected rebel tile so the
 * action stays anchored to the map instead of the HUD slab.
 * @param {object} game live game singleton.
 * @param {object|null} tile current selection.
 */
function updateTileAttackOverlay(game, tile) {
    const layer = document.getElementById('tile-action-layer');
    const btn = document.getElementById('tile-attack-overlay-btn');
    if (!layer || !btn) return;

    const resolvedTile = resolveOverworldTile(game, tile);
    const isHostile = resolvedTile
        && (RebelSystem?.isRebelCampTile?.(resolvedTile) || resolvedTile.owner === 'enemy');
    const shouldHide = !resolvedTile || !isHostile || game.state !== 'OVERWORLD';
    if (shouldHide) {
        const reason = !resolvedTile
            ? 'missing-tile'
            : !isHostile
                ? 'not-hostile'
                : 'state';
        const tileKey = resolvedTile?.hex?.toString?.()
            || resolvedTile?.toString?.()
            || tile?.hex?.toString?.()
            || tile?.toString?.()
            || null;
        game.debugAttackOverlay?.({
            reason,
            state: game.state,
            isHostile,
            tileKey
        });
        btn.style.display = 'none';
        return;
    }

    const pos = game.projectHexToScreen(resolvedTile.hex || resolvedTile);
    btn.style.display = 'inline-flex';
    btn.style.left = `${pos.x - 30}px`;
    btn.style.top = `${pos.y - 56}px`;
    btn.onclick = (e) => {
        e?.stopPropagation?.();
        btn.style.display = 'none';
        beginCombatFromTile(game, resolvedTile, e);
    };
}

function showFloatingText(game, x, y, txt, cssClass) {
    const layer = game.fxLayer || document.getElementById('fx-layer');
    if (!layer) return;
    const el = document.createElement('div');
    el.className = 'floating-text';
    if (cssClass) el.classList.add(cssClass);
    el.innerText = txt;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 820);
}

/**
 * Resolve the shared tutorial callout helper regardless of module system.
 */
function getCalloutHelper() {
    if (typeof TutorialCallouts !== 'undefined') return TutorialCallouts;
    if (typeof window !== 'undefined' && window.TutorialCallouts) return window.TutorialCallouts;
    return null;
}

/**
 * Display a tile-anchored callout using the shared tutorial helper so game logic stays DOM-agnostic.
 * @param {object} game live game singleton.
 * @param {object} tile tile to anchor against.
 * @param {object} options passthrough options for TutorialCallouts.showTileCallout.
 */
function showTileCallout(game, tile, options) {
    const helper = getCalloutHelper();
    if (!helper || typeof helper.showTileCallout !== 'function') return null;
    return helper.showTileCallout(game, tile, options);
}

/** Hide the active tile-anchored callout when the player acknowledges the prompt. */
function hideTileCallout() {
    const helper = getCalloutHelper();
    if (!helper || typeof helper.hideTileCallout !== 'function') return;
    helper.hideTileCallout();
}

function triggerCameraShake(game) {
    const target = document.getElementById('game-container');
    if (!target) return;
    target.classList.add('shake');
    clearTimeout(game.shakeTimer);
    game.shakeTimer = setTimeout(() => target.classList.remove('shake'), Juice.clampShakeDuration(300));
}

function spawnParticleBurst(game, x, y, count = 6, colors = ['#ffd166', '#06d6a0', '#ef476f']) {
    const layer = game.fxLayer || document.getElementById('fx-layer');
    if (!layer || typeof Juice === 'undefined') return;
    const burst = Juice.createBurstVectors(count, 18, 46);
    burst.forEach((vec, idx) => {
        const node = document.createElement('div');
        node.className = 'particle';
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        node.style.setProperty('--dx', vec.dx.toFixed(2));
        node.style.setProperty('--dy', vec.dy.toFixed(2));
        node.style.background = colors[idx % colors.length];
        layer.appendChild(node);
        setTimeout(() => node.remove(), vec.duration);
    });
}

function spawnBurstAtHex(game, deps, pos, count) {
    const point = game.projectHexToScreen(pos);
    spawnParticleBurst(game, point.x, point.y, count);
}

function spawnTxt(game, deps, pos, txt, col) {
    const HexImpl = deps.Hex || game.Hex || window.Hex;
    const LayoutImpl = deps.Layout || window.Layout || {};
    const layout = { origin: game.cam, size: 30 * game.cam.zoom, ...LayoutImpl };
    const hex = pos.toPixel ? pos : new HexImpl(pos.q, pos.r, pos.s ?? -pos.q - pos.r);
    const p = hex.toPixel(layout);
    const el = document.createElement('div');
    el.className = 'floater'; el.innerText = txt;
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; el.style.color = col;
    document.body.appendChild(el);
    game.combat.particles.push({ el, life: 2.5 });
}

function showWarTip(deps) {
    const tips = deps.TIPS || [];
    const el = document.getElementById('tip-overlay');
    if (!el) return;
    const tip = tips.length > 0 ? tips[Math.floor(Math.random() * tips.length)] : '';
    el.innerText = tip;
    el.classList.add('tip-visible');
    setTimeout(() => el.classList.remove('tip-visible'), 4000);
}

function hideWarTip() {
    const el = document.getElementById('tip-overlay');
    if (!el) return;
    el.classList.remove('tip-visible');
}

function showOverworldUI() {
    const overworld = document.getElementById('ui-overworld');
    const combat = document.getElementById('ui-combat');
    const stateTxt = document.getElementById('state-txt');
    overworld?.classList.add('visible');
    combat?.classList.remove('visible');
    if (stateTxt) stateTxt.innerText = 'KINGDOM';
}

export { updateTileInspector, createHudDrawerController, updateResearchUI };
