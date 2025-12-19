import { DEFAULT_IMPERIAL_FAVOR, clampImperialFavor } from '../imperialFavor.js';

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
            bonus.innerText = awaitingReclamation
                ? 'Awaiting reclamation target'
                : pendingReclamations
                    ? `${pendingReclamations} reclamation queued${placementCost}`
                    : hasEligibleFields
                        ? `Select a tile to reclaim${placementCost}`
                        : 'No eligible fields to reclaim';
            bonus.title = awaitingReclamation
                ? 'A reclamation target has been locked in.'
                : pendingReclamations
                    ? 'Reclamation will apply to your next capture.'
                    : hasEligibleFields
                        ? 'Purchase a reclamation to deploy on your next capture.'
                        : 'Capture more farmland to reclaim it.';
        }
        hideAdjacency();
        return;
    }

    const labelParts = [tile.region?.toUpperCase?.()];
    if (tile.status === 'REBELLIOUS') labelParts.unshift('Rebel:');
    if (labelParts.filter(Boolean).length === 0) labelParts.push('Uncharted Territory');
    label.innerText = labelParts.filter(Boolean).join(' ');

    panel.classList.toggle('hostile', tile.status === 'REBELLIOUS');

    const bonusDesc = typeof game.describeTileBonus === 'function' ? game.describeTileBonus(tile) : '';
    if (bonus) {
        bonus.innerText = bonusDesc;
        bonus.title = bonusDesc;
    }

    const adjacencyMeta = typeof game.describeTileAdjacency === 'function' ? game.describeTileAdjacency(tile) : null;
    if (adjacencyMeta && adjacencyMeta.summary) {
        showAdjacency(adjacencyMeta.summary, adjacencyMeta.detail);
    } else {
        hideAdjacency();
    }

    game.updateTileAttackOverlay?.(tile);
}

function updateTileAttackOverlay(game, tile) {
    const btn = document.getElementById('attack-btn');
    if (!btn) return;
    if (!tile || !tile.walkable || !tile.enemy || tile.enemy.cleared || game.state !== 'OVERWORLD') {
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

function showOverworldUI() {
    const overworld = document.getElementById('ui-overworld');
    const combat = document.getElementById('ui-combat');
    const stateTxt = document.getElementById('state-txt');
    overworld?.classList.add('visible');
    combat?.classList.remove('visible');
    if (stateTxt) stateTxt.innerText = 'KINGDOM';
}

/**
 * Bind HUD-related utilities onto the game object so gameplay code can update and react
 * to UI state without owning DOM logic directly.
 * @param {object} game live game singleton.
 * @param {object} deps shared dependencies such as Hex, Layout, or content arrays.
 */
export function bindHud(game, deps = {}) {
    game.bindVoidClickEasterEgg = () => bindVoidClickEasterEgg(game, deps);
    game.setupInput = () => setupInput(game);
    game.toggleSidebar = (forceState) => toggleSidebar(forceState);
    game.toggleMandatesPanel = (forceState) => toggleMandatesPanel(forceState);
    game.updateSaveStatus = (msg) => updateSaveStatus(msg);
    game.updateSaveSlotsUI = () => updateSaveSlotsUI(game);
    game.updateLeaderboardUI = () => updateLeaderboardUI(game);
    game.updateSettingsUI = () => updateSettingsUI(game);
    game.updateHUD = () => updateHUD(game);
    game.updateTileInspector = (tile) => updateTileInspector(game, tile);
    game.updateTileAttackOverlay = (tile) => updateTileAttackOverlay(game, tile);
    game.showFloatingText = (x, y, txt, cssClass) => showFloatingText(game, x, y, txt, cssClass);
    game.triggerCameraShake = () => triggerCameraShake(game);
    game.spawnParticleBurst = (x, y, count, colors) => spawnParticleBurst(game, x, y, count, colors);
    game.spawnBurstAtHex = (pos, count) => spawnBurstAtHex(game, deps, pos, count);
    game.spawnTxt = (pos, txt, col) => spawnTxt(game, deps, pos, txt, col);
    game.renderMandatesPanel = () => renderMandatesPanel();
    game.showOverworldUI = () => showOverworldUI();
}

export {
    bindVoidClickEasterEgg,
    setupInput,
    toggleSidebar,
    toggleMandatesPanel,
    updateSaveStatus,
    updateSaveSlotsUI,
    updateLeaderboardUI,
    updateSettingsUI,
    updateTileInspector,
    updateTileAttackOverlay,
    showFloatingText,
    triggerCameraShake,
    spawnParticleBurst,
    spawnBurstAtHex,
    spawnTxt,
    showOverworldUI
};
