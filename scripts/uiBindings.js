import { createNotificationStack, getSharedStack, setSharedStack } from './notificationStack.js';

/**
 * UI binding helpers responsible for DOM wiring and presentation updates.
 * These functions keep script.js focused on core game logic.
 */

let cachedNotificationStack = null;
const DEFAULT_IMPERIAL_FAVOR = 5;

/** Clamp imperial favor values to the HUD's 1–10 range for display. */
function clampImperialFavor(value) {
    const numeric = Number.isFinite(value) ? Math.round(value) : DEFAULT_IMPERIAL_FAVOR;
    return Math.min(10, Math.max(1, numeric));
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
 * Wire DOM event listeners for primary UI controls.
 * @param {object} game live game singleton.
 */
export function setupUIBindings(game) {
    const retreatBtn = document.getElementById('btn-retreat');
    if (retreatBtn) retreatBtn.onclick = (e) => game.endWar('RETREAT', e);

    const upgradeBtn = document.getElementById('btn-upg');
    if (upgradeBtn) upgradeBtn.onclick = () => { document.getElementById('upgrade-menu').style.display = 'flex'; };

    const closeUpgradeBtn = document.getElementById('btn-close-upg');
    if (closeUpgradeBtn) closeUpgradeBtn.onclick = () => { document.getElementById('upgrade-menu').style.display = 'none'; };

    const researchBtn = document.getElementById('btn-research');
    if (researchBtn) researchBtn.onclick = () => game.toggleResearch(true);

    const closeResearchBtn = document.getElementById('btn-close-research');
    if (closeResearchBtn) closeResearchBtn.onclick = () => game.toggleResearch(false);

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

    const soldierBtn = document.getElementById('buy-soldier');
    if (soldierBtn) soldierBtn.onclick = () => game.buyUpgrade('soldier');
    const archerBtn = document.getElementById('buy-archer');
    if (archerBtn) archerBtn.onclick = () => game.buyUpgrade('archer');
    const prodBtn = document.getElementById('buy-prod');
    if (prodBtn) prodBtn.onclick = () => game.buyUpgrade('production');
    const minesBtn = document.getElementById('buy-mines');
    if (minesBtn) minesBtn.onclick = () => game.buyUpgrade('mines');
    const defenseBtn = document.getElementById('buy-defense');
    if (defenseBtn) defenseBtn.onclick = () => game.buyUpgrade('defense');
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
    const onMove = (x, y) => { if (isDrag) { game.cam.x = camStart.x + (x - start.x); game.cam.y = camStart.y + (y - start.y); } };
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
    const modal = document.getElementById('research-modal');
    if (!modal) return;
    modal.style.display = forceOpen === false ? 'none' : 'flex';
    if (forceOpen !== false) game.updateResearchUI();
}

function updateResearchUI(game) {
    const grid = document.getElementById('tech-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const livesTech = game.getTech('lives');
    const livesCap = livesTech?.maxPurchases || 3;
    const livesLabel = document.getElementById('research-lives');
    if (livesLabel) livesLabel.innerText = `❤️ ${game.research.lives}/${livesCap}`;
    const headerLives = document.getElementById('lives-count');
    if (headerLives) headerLives.innerText = game.research.lives;

    game.research.technologies.forEach((tech) => {
        const card = document.createElement('div');
        card.className = 'tech-card';

        const title = document.createElement('h3');
        title.className = 'tech-title';
        const counter = tech.maxPurchases && tech.maxPurchases > 1 ? ` (${tech.timesPurchased}/${tech.maxPurchases})` : '';
        title.innerText = `${tech.name}${counter}`;

        const desc = document.createElement('p');
        desc.className = 'tech-desc';
        desc.innerText = tech.description;

        const costLine = document.createElement('p');
        costLine.className = 'tech-cost';

        const actions = document.createElement('div');
        actions.className = 'tech-actions';

        const canBuyMore = ResearchSystem.hasRemainingPurchases(tech);
        let affordable = false;

        if (tech.costOptions && tech.costOptions.length > 0) {
            costLine.innerText = tech.costOptions.map((opt) => `${opt.label} (${game.formatCost(game.getTechCost(tech, opt.id))})`).join(' | ');
            tech.costOptions.forEach((opt) => {
                const optCost = game.getTechCost(tech, opt.id);
                const btn = document.createElement('button');
                btn.innerText = opt.label;
                const canAfford = game.canPayCost(optCost) && canBuyMore && game.hasFieldToConvert();
                affordable = affordable || canAfford;
                btn.disabled = !canAfford;
                btn.classList.add('primary-btn');
                btn.onclick = () => game.buyTechnology(tech.id, opt.id);
                actions.appendChild(btn);
            });
        } else {
            const cost = game.getTechCost(tech);
            costLine.innerText = `Cost: ${game.formatCost(cost)}`;
            affordable = game.canPayCost(cost) && canBuyMore;
            const btn = document.createElement('button');
            btn.innerText = tech.purchased ? 'Repurchase' : 'Purchase';
            btn.disabled = !affordable;
            btn.classList.add('primary-btn');
            btn.onclick = () => game.buyTechnology(tech.id);
            actions.appendChild(btn);
        }

        if (!canBuyMore) {
            card.classList.add('purchased');
            actions.querySelectorAll('button').forEach((btn) => {
                btn.disabled = true;
                btn.classList.add('purchased-btn');
                btn.innerText = 'Purchased';
            });
        } else if (affordable) {
            card.classList.add('affordable');
        } else {
            card.classList.add('unaffordable');
        }

        card.appendChild(title);
        card.appendChild(desc);
        card.appendChild(costLine);
        card.appendChild(actions);
        grid.appendChild(card);
    });
}

function updateLeaderboardUI(game) {
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setTxt('stat-best-lvl', game.stats.bestDifficulty || 0);
    setTxt('stat-best-kills', game.stats.bestKills || 0);
    setTxt('stat-total-kills', game.stats.totalKills || 0);
    setTxt('stat-wars', game.stats.warsPlayed || 0);
    if (game.stats.lastSaveISO) game.updateSaveStatus(`Last saved ${game.stats.lastSaveISO}`);
}

function updateUpgradeMenu(game) {
    document.getElementById('lbl-soldier').innerText = `Lv. ${game.upgrades.soldier}`;
    document.getElementById('buy-soldier').innerText = `${game.getUpgradeCost('soldier')}g`;
    document.getElementById('lbl-archer').innerText = `Lv. ${game.upgrades.archer}`;
    document.getElementById('buy-archer').innerText = `${game.getUpgradeCost('archer')}g`;
    document.getElementById('lbl-prod').innerText = `Lv. ${game.upgrades.production}`;
    document.getElementById('buy-prod').innerText = `${game.getUpgradeCost('production')}g`;
    document.getElementById('lbl-mines').innerText = `Lv. ${game.upgrades.mines}`;
    document.getElementById('buy-mines').innerText = `${game.getUpgradeCost('mines')}g`;
    document.getElementById('lbl-defense').innerText = `Lv. ${game.upgrades.defense}`;
    document.getElementById('buy-defense').innerText = `${game.getUpgradeCost('defense')}g`;
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
        const formatted = game.timekeeper?.formatCalendar?.() || 'M: 1 | W: 1/5 | D: 1/40';
        calendar.innerText = formatted;
        const weeksPerMonth = game.timekeeper?.weeksPerMonth || 5;
        const daysPerWeek = game.timekeeper?.daysPerWeek || 8;
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
    if (!panel || !label) return;

    const shouldHide = game.state !== 'OVERWORLD';
    panel.classList.toggle('hidden', shouldHide);
    if (shouldHide) {
        game.updateTileAttackOverlay?.(null);
        if (bonus) {
            bonus.innerText = '';
            bonus.title = '';
        }
        return;
    }

    if (!tile) {
        label.innerText = 'Select a tile to inspect';
        panel.classList.remove('hostile');
        if (bonus) {
            bonus.classList.toggle('paused', !!game.paused);
            bonus.innerText = game.paused
                ? '⏸️ Paused — cluster bonuses frozen until you resume'
                : 'Cluster bonuses appear when you select a tile.';
            bonus.title = '';
        }
        game.updateTileAttackOverlay?.(null);
        return;
    }

    const isRebelTile = typeof RebelSystem !== 'undefined' && RebelSystem.isRebelCampTile?.(tile);
    const isHostile = isRebelTile || tile.owner === 'enemy';
    const labelText = tile.type ? tile.type.toString().replace(/-/g, ' ') : 'Unknown Tile';

    label.innerText = labelText.toUpperCase();
    panel.classList.toggle('hostile', !!isHostile);
    game.updateTileAttackOverlay?.(isHostile ? tile : null);

    if (bonus) {
        const key = tile.hex?.toString?.() || `${tile.hex?.q ?? 0},${tile.hex?.r ?? 0}`;
        const clusterMap = game.overworld?.clusterBonuses;
        const cluster = tile.clusterBonus || (key ? clusterMap?.get(key) : null);
        const resourceParts = [];
        if (cluster?.goldBonus) resourceParts.push(`+${cluster.goldBonus}g`);
        if (cluster?.woodBonus) resourceParts.push(`+${cluster.woodBonus}w`);
        const clusterLabel = cluster?.size ? `${cluster.size}-tile ${labelText.toLowerCase()} cluster` : 'No adjacency data';
        const payload = resourceParts.length ? resourceParts.join(' ') : 'No bonus income';
        const pauseSuffix = game.paused ? ' (paused)' : '';
        bonus.innerText = `${payload} — ${clusterLabel}${pauseSuffix}`;

        const tooltipParts = [];
        if (cluster?.adjacencyRate) tooltipParts.push(`Adjacency ${(cluster.adjacencyRate * 100).toFixed(0)}%`);
        if (cluster?.reclamationRate) tooltipParts.push(`Reclamation ${(cluster.reclamationRate * 100).toFixed(0)}%`);
        bonus.title = tooltipParts.length ? tooltipParts.join(' • ') : 'No adjacency modifiers';
        bonus.classList.toggle('paused', !!game.paused);
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

    const isHostile = tile && (RebelSystem.isRebelCampTile?.(tile) || tile.owner === 'enemy');
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

export { updateTileInspector };
