import { createNotificationStack, getSharedStack, setSharedStack } from './notificationStack.js';
import { DEFAULT_IMPERIAL_FAVOR, clampImperialFavor } from './imperialFavor.js';

/**
 * UI binding helpers responsible for DOM wiring and presentation updates.
 * These functions keep script.js focused on core game logic.
 */

let cachedNotificationStack = null;

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
 * @param {'upgrades'|'research'} mode active drawer view.
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
        research: getScopedElement('#drawer-research-template')
    };
    const triggers = {
        upgrades: getScopedElement('#btn-upg'),
        research: getScopedElement('#btn-research')
    };
    const closeBtn = getScopedElement('#hud-drawer-close');

    if (!drawer || !contentHost) {
        return {
            showUpgrades: () => bindUpgradeButtons(game),
            showResearch: () => game.updateResearchUI?.(),
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
        hide,
        hideIfActive,
        activeView: () => activeView
    };
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
            const optionPicker = document.createElement('div');
            optionPicker.className = 'tech-options option-stack';
            let selectedOptionId = null;

            const hasAffordableOption = tech.costOptions.some((opt) => {
                const optCost = game.getTechCost(tech, opt.id);
                return optCost
                    && (tech.id !== 'land-reclamation' || game.hasFieldToConvert())
                    && game.canPayCost(optCost);
            });

            const purchaseBtn = document.createElement('button');
            purchaseBtn.classList.add('card-btn', 'primary-btn', 'tech-purchase-btn');
            purchaseBtn.disabled = true;

            const formatPurchaseLabel = (costLabel) => {
                const suffix = purchaseIndexLabel ? ` ${purchaseIndexLabel}` : '';
                if (!costLabel) return 'Select focus';
                return `Purchase${suffix ? ` ${suffix}` : ''} (${costLabel})`;
            };

            const updateOptionState = () => {
                const cost = selectedOptionId ? game.getTechCost(tech, selectedOptionId) : null;
                const canAfford = cost
                    && canBuyMore
                    && (tech.id !== 'land-reclamation' || game.hasFieldToConvert())
                    && game.canPayCost(cost);
                const costLabel = cost ? game.formatCost(cost) : '';
                purchaseBtn.disabled = !canAfford;
                applyPurchaseAffordability(purchaseBtn, canAfford);
                purchaseBtn.title = selectedOptionId ? '' : 'Choose an option first';
                purchaseBtn.innerText = formatPurchaseLabel(costLabel);
                affordable = (hasAffordableOption && canBuyMore) || canAfford;
            };

            tech.costOptions.forEach((opt) => {
                const optBtn = document.createElement('button');
                optBtn.innerText = opt.label;
                optBtn.classList.add('card-btn', 'primary-btn', 'option-btn');
                optBtn.onclick = () => {
                    selectedOptionId = opt.id;
                    optionPicker.querySelectorAll('button').forEach((btn) => btn.classList.toggle('active', btn === optBtn));
                    updateOptionState();
                };
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
function updateSettingsUI(game) {
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
    document.querySelectorAll('[data-visual-toggle]').forEach((input) => {
        const key = input.dataset.visualToggle;
        const desired = visuals && Object.prototype.hasOwnProperty.call(visuals, key)
            ? visuals[key]
            : false;
        input.checked = Boolean(desired);
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
    const imperialFavor = document.getElementById('imperial-favor');
    if (imperialFavor) imperialFavor.innerText = clampImperialFavor(game.imperialFavor ?? DEFAULT_IMPERIAL_FAVOR);
    const calendar = document.getElementById('calendar-readout');
    if (calendar) {
        const formatted = game.timekeeper?.formatCalendar?.() || 'M: Jan Y1 | W: 1/4 | D: 1/28';
        calendar.innerText = formatted;
        const weeksPerMonth = game.timekeeper?.weeksPerMonth || 4;
        const daysPerWeek = game.timekeeper?.daysPerWeek || 7;
        calendar.title = `${weeksPerMonth} weeks/month · ${daysPerWeek}-day weeks`;
    }
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
    document.getElementById('lvl-txt').innerText = `Lv.${game.difficulty}`;
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
                const targetLabel = pendingReclamationTarget ? pendingReclamationTarget.toUpperCase() : 'UPGRADE';
                if (!hasEligibleFields) {
                    bonus.innerText = 'Reclamation paused: no player fields available to convert.';
                    bonus.title = 'Claim or reclaim neutral territory to free up a field target.';
                } else {
                    bonus.innerText = `Reclamation ready (${pendingReclamations}): select a field to build a ${targetLabel}${placementCost}.`;
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

    const claimCost = typeof tile.claimCost === 'number' ? tile.claimCost : null;
    const isRebelTile = typeof RebelSystem !== 'undefined' && RebelSystem.isRebelCampTile?.(tile);
    const isHostile = !claimCost && (isRebelTile || tile.owner === 'enemy' || tile.owner === 'rebel');
    const labelText = claimCost !== null
        ? 'Unclaimed Frontier'
        : tile.type
            ? tile.type.toString().replace(/-/g, ' ')
            : 'Unknown Tile';

    label.innerText = labelText.toUpperCase();
    panel.classList.toggle('hostile', !!isHostile);
    game.updateTileAttackOverlay?.(isHostile ? tile : null);

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

        if (awaitingReclamation && tile.owner === 'enemy') {
            bonus.innerText = 'Enemy tile — reclaim a player field instead.';
            bonus.title = 'Land reclamation can only target neutral or player-owned fields.';
            hideAdjacency();
            return;
        }

        if (awaitingReclamation && tile.type !== 'field') {
            bonus.innerText = 'Reclamation ready: select a player-controlled field to convert.';
            bonus.title = 'Only fields can be upgraded via land reclamation.';
            hideAdjacency();
            return;
        }

        if (pendingReclamations && tile.type === 'field' && tile.owner !== 'enemy') {
            const targetLabel = pendingReclamationTarget ? pendingReclamationTarget.toUpperCase() : 'UPGRADE';
            const costLine = pendingCostLabel ? ` (${pendingCostLabel} on placement)` : '';
            bonus.innerText = `Reclaim ready: convert to ${targetLabel}${costLine}.`;
            bonus.title = 'Gold will be charged after selecting a valid player-owned field.';
            hideAdjacency();
            return;
        }

        const key = tile.hex?.toString?.() || `${tile.hex?.q ?? 0},${tile.hex?.r ?? 0}`;
        const clusterMap = game.overworld?.clusterBonuses;
        const cluster = key && clusterMap?.has(key) ? clusterMap.get(key) : tile.clusterBonus;
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

    const isHostile = tile && (RebelSystem.isRebelCampTile?.(tile) || tile.owner === 'enemy' || tile.owner === 'rebel');
    const shouldHide = !tile || !isHostile || game.state !== 'OVERWORLD';
    if (shouldHide) {
        btn.style.display = 'none';
        return;
    }

    const pos = game.projectHexToScreen(tile.hex || tile);
    btn.style.display = 'inline-flex';
    btn.style.left = `${pos.x - 30}px`;
    btn.style.top = `${pos.y - 56}px`;
    btn.onclick = (e) => {
        e?.stopPropagation?.();
        btn.style.display = 'none';
        game.beginBattleFromTile(tile, e);
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
