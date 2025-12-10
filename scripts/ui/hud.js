/** Clamp imperial favor values to the HUD's 1–10 range for display. */
export const DEFAULT_IMPERIAL_FAVOR = 5;
export function clampImperialFavor(value) {
    const numeric = Number.isFinite(value) ? Math.round(value) : DEFAULT_IMPERIAL_FAVOR;
    return Math.min(10, Math.max(1, numeric));
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

/**
 * Toggle the lightweight mandates/task flyout without blocking canvas pointer events.
 * The container keeps pointer-events disabled so the map remains interactive while open.
 * @param {boolean} [forceState] optional explicit open/close state.
 */
export function toggleMandatesPanel(forceState) {
    const panel = document.getElementById('mandates-panel');
    if (!panel) return;
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !panel.classList.contains('open');
    if (shouldOpen) renderMandatesPanel();
    panel.classList.toggle('open', shouldOpen);
    panel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    const trigger = document.getElementById('btn-mandates');
    if (trigger) trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

/**
 * Update the HUD save status label with the latest persistence message.
 * @param {string} msg human readable status string.
 */
export function updateSaveStatus(msg) {
    const el = document.getElementById('save-status');
    if (el) el.innerText = msg;
}

/**
 * Refresh the save slot captions and disabled states based on persistence metadata.
 * @param {object} game live game singleton exposing active slot id.
 */
export function updateSaveSlotsUI(game) {
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
 * Refresh the shared drawer header with context for either upgrades or research.
 * @param {'upgrades'|'research'} mode active drawer view.
 * @param {object} game live game singleton exposing research metadata.
 */
export function syncHudDrawerHeader(mode, game) {
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
export function createHudDrawerController(game) {
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
 * Wire the canvas pointer controls for dragging, clicking, and zooming.
 * @param {object} game live game singleton.
 */
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

/**
 * Attach the void-click easter egg handler that responds to clicks off the map.
 * @param {object} game live game singleton.
 * @param {object} deps injected Hex/Layout implementations.
 */
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

/**
 * Toggle the sidebar open/closed state or enforce a specific state.
 * @param {boolean} [forceState] optional state to enforce.
 */
export function toggleSidebar(forceState) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', shouldOpen);
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
export function updateUpgradeMenu(game) {
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
export function updateTileInspector(game, tile) {
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
                    bonus.title = 'Establish a field to continue reclamations.';
                } else {
                    bonus.innerText = awaitingReclamation
                        ? `Awaiting reclamation: ${targetLabel}${placementCost}`
                        : `Queued reclamation: ${targetLabel}${placementCost}`;
                    bonus.title = awaitingReclamation
                        ? 'Queued reclamation will begin when production frees.'
                        : 'A queued reclamation is ready once the current production finishes.';
                }
            } else {
                bonus.innerText = 'Waiting for your command.';
                bonus.title = game.paused
                    ? 'Unpause to resume orders.'
                    : 'Select a tile to view bonuses and available actions.';
            }
        }
        if (awaitingReclamation && !hasEligibleFields) {
            showAdjacency('No adjacency bonuses', 'Secure more territory to continue reclamations.');
        } else {
            hideAdjacency();
        }
        return;
    }

    const placements = Array.isArray(game.pendingReclamations)
        ? game.pendingReclamations.filter((p) => p && p.target === tile)
        : [];

    const pendingPlacement = placements.length ? placements[0] : null;
    const queuedLabel = pendingPlacement?.queuedUpgrade && typeof pendingPlacement.queuedUpgrade === 'string'
        ? pendingPlacement.queuedUpgrade.toUpperCase()
        : null;
    const queuedCostLabel = pendingPlacement?.cost && typeof game.formatCost === 'function'
        ? game.formatCost(pendingPlacement.cost)
        : '';

    const claimable = tile.owner === 'neutral' && typeof tile.claimCost === 'number';
    if (claimable) {
        panel.classList.remove('hostile');
        label.innerText = 'UNCLAIMED FRONTIER';
        const costLabel = typeof game.formatCost === 'function'
            ? game.formatCost({ wood: tile.claimCost })
            : `${tile.claimCost}w`;
        const woodShortfall = Math.max(0, tile.claimCost - (Number.isFinite(game.wood) ? game.wood : 0));
        if (bonus) {
            const shortfallText = woodShortfall > 0 ? ` Need ${woodShortfall} more wood.` : '';
            bonus.innerText = `Claim cost: ${costLabel}.${shortfallText}`;
            bonus.title = woodShortfall > 0
                ? 'Gather more wood to secure this tile.'
                : 'Spend wood to claim the frontier tile instantly.';
            bonus.classList.toggle('paused', !!game.paused);
        }
        hideAdjacency();
        return;
    }

    const tileLabel = tile?.label || (tile.type ? tile.type.toString().toUpperCase() : 'Unknown tile');
    label.innerText = tileLabel;
    const isHostile = tile.status === 'HOSTILE' || tile.owner === 'enemy' || tile.owner === 'rebel';
    panel.classList.toggle('hostile', isHostile);

    const summary = typeof game.describeAdjacencySummary === 'function'
        ? game.describeAdjacencySummary(tile)
        : null;
    if (summary?.short) {
        showAdjacency(summary.short, summary.long);
    } else {
        hideAdjacency();
    }

    let bonusText = typeof game.describeTileBonus === 'function'
        ? game.describeTileBonus(tile)
        : '';
    if (awaitingReclamation && tile.owner === 'enemy') bonusText += '\nReclamation cannot target an enemy tile.';
    if (bonus) {
        bonus.innerText = queuedLabel
            ? `${bonusText}\nReclamation queued: ${queuedLabel} (${queuedCostLabel})`
            : bonusText;
        bonus.title = tile.bonusTooltip || summary?.long || '';
        bonus.classList.toggle('paused', !!game.paused);
    }

    const btn = document.getElementById('btn-attack');
    if (!btn) return;

    btn.classList.toggle('active', tile.status === 'HOSTILE');
    btn.setAttribute('aria-hidden', tile.status === 'FRIENDLY' ? 'true' : 'false');

    if (!tile || tile.status !== 'HOSTILE') {
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

/**
 * Keep the leaderboard readouts synchronized with the latest stats payload.
 * @param {object} game live game singleton containing stats.
 */
export function updateLeaderboardUI(game) {
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
    const audioSettings = typeof game.getAudioSettings === 'function'
        ? game.getAudioSettings()
        : { master: 1, music: 1, sfx: 1 };
    const clampPercent = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
    document.querySelectorAll('[data-audio-setting]').forEach((input) => {
        const key = input.dataset.audioSetting;
        const normalized = clampPercent(audioSettings[key]);
        const percent = Math.round(normalized * 100);
        input.value = percent;
        const readout = document.querySelector(`[data-audio-readout="${key}"]`);
        if (readout) readout.innerText = `${percent}%`;
    });

    const visuals = typeof game.getVisualSettings === 'function'
        ? game.getVisualSettings()
        : {};
    document.querySelectorAll('[data-visual-toggle]').forEach((input) => {
        const key = input.dataset.visualToggle;
        const desired = visuals && Object.prototype.hasOwnProperty.call(visuals, key)
            ? visuals[key]
            : false;
        input.checked = Boolean(desired);
    });
}

function getCalloutHelper() {
    if (typeof TutorialCallouts !== 'undefined') return TutorialCallouts;
    if (typeof window !== 'undefined' && window.TutorialCallouts) return window.TutorialCallouts;
    return null;
}

/**
 * Display a tile-anchored callout using the shared tutorial helper.
 * @param {object} game live game singleton.
 * @param {object} tile tile to anchor against.
 * @param {object} options passthrough options for TutorialCallouts.showTileCallout.
 */
export function showTileCallout(game, tile, options) {
    const helper = getCalloutHelper();
    if (!helper || typeof helper.showTileCallout !== 'function') return null;
    return helper.showTileCallout(game, tile, options);
}

/** Hide the active tile-anchored callout when the player acknowledges the prompt. */
export function hideTileCallout() {
    const helper = getCalloutHelper();
    if (!helper || typeof helper.hideTileCallout !== 'function') return;
    helper.hideTileCallout();
}

/** Reveal the overworld HUD layer and hide combat overlays. */
export function showOverworldUI() {
    const overworld = document.getElementById('ui-overworld');
    const combat = document.getElementById('ui-combat');
    const stateTxt = document.getElementById('state-txt');
    overworld?.classList.add('visible');
    combat?.classList.remove('visible');
    if (stateTxt) stateTxt.innerText = 'KINGDOM';
}

/** Wire DOM event listeners for primary UI controls. */
export function setupUIBindings(game) {
    const retreatBtn = document.getElementById('btn-retreat');
    if (retreatBtn) retreatBtn.onclick = (e) => game.endWar('RETREAT', e);

    const drawerController = createHudDrawerController(game);
    game.hudDrawer = drawerController;

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
            if (typeof game.setAudioVolume === 'function') game.setAudioVolume(channel, value);
        });
    });

    document.querySelectorAll('[data-visual-toggle]').forEach((input) => {
        input.addEventListener('change', () => {
            if (typeof game.setFogToggle === 'function') game.setFogToggle(input.dataset.visualToggle, input.checked);
        });
    });

    if (typeof game.updateSettingsUI === 'function') game.updateSettingsUI();
}

export { bindVoidClickEasterEgg, setupInput };
