import { START_TICK } from '../timekeeper.js';
import { OVERWORLD_TILES } from '../overworldConfig.js';
import { drawOverworldTiles } from '../overworldRenderer.js';
import { advanceOverworldTimer } from '../overworldTicks.js';
import { buildClusterBonusMap, DEFAULT_CLUSTER_RATE } from '../overworldAdjacency.js';
import { TILE_VISIBILITY } from '../visibilityMask.js';
import { buildWaterBody, stampWaterBody } from '../waterGenerator.js';
import { clampImperialFavor, DEFAULT_IMPERIAL_FAVOR } from '../imperialFavor.js';

/**
 * Build the starting overworld state and clear any lingering combat/claimable data.
 * @param {object} game live Game instance.
 */
export function bootstrapNewWorld(game) {
    game.state = 'OVERWORLD';
    game.paused = false;
    game.gold = 300;
    game.wood = 40;
    game.difficulty = 0;
    game.upgrades = { soldier: 1, archer: 1, production: 1, mines: 1, defense: 1 };
    game.overworld.hexes = new Map();
    game.overworld.claimable = new Map();
    game.addOverworldHex(new game.Hex(0, 0), 'castle');
    for (let i = 0; i < 6; i += 1) game.claimHexLogic(game.Hex.neighbor(new game.Hex(0, 0), i), true);
    game.calcOverworldGhosts();
    game.finalizeStarterTerritory();
    game.syncReclamationAwaitState();
    game.research = game.buildResearchState();
    game.updateResearchBonuses();
    game.resetSession();
    game.imperialFavor = DEFAULT_IMPERIAL_FAVOR;
    game.timekeeper.reset(START_TICK);
    game.pendingNotifications = [];
    game.updateSaveStatus('Fresh campaign');
    game.showOverworldUI();
    if (game.imperialMandates?.resetForNewCampaign) game.imperialMandates.resetForNewCampaign();
    if (typeof window !== 'undefined' && window.IntroOverlay) {
        window.IntroOverlay.clearIntroSeenFlag?.();
        window.IntroOverlay.reset();
    }
    game.shouldRunImperialIntro = typeof document !== 'undefined';
    if (!game.shouldRunImperialIntro || (typeof window !== 'undefined' && window.IntroOverlay && window.IntroOverlay.active === false)) {
        game.issueImperialIntroMandate();
        game.shouldRunImperialIntro = false;
    }
}

/**
 * Apply a hydrated snapshot to the live game state (overworld only).
 * @param {object} game live Game instance.
 * @param {object} snapshot persisted snapshot payload.
 */
export function applyOverworldSnapshot(game, snapshot) {
    game.state = 'OVERWORLD';
    game.paused = false;
    game.gold = snapshot.gold;
    game.wood = snapshot.wood;
    game.difficulty = snapshot.difficulty;
    game.upgrades = { ...game.upgrades, ...snapshot.upgrades };
    game.research = game.buildResearchState(snapshot.research);
    game.updateResearchBonuses();
    game.pendingReclamations = [];
    game.overworld.hexes = snapshot.overworld.hexes;
    game.overworld.claimable = new Map();
    game.calcOverworldGhosts();
    game.refreshClusterBonuses();
    game.resetSession();
    game.imperialFavor = clampImperialFavor(snapshot.imperialFavor ?? DEFAULT_IMPERIAL_FAVOR);
    game.timekeeper.daysPerWeek = snapshot.timekeeper?.daysPerWeek || game.timekeeper.daysPerWeek;
    game.timekeeper.weeksPerMonth = snapshot.timekeeper?.weeksPerMonth || game.timekeeper.weeksPerMonth;
    game.timekeeper.reset(snapshot.timekeeper?.ticks || 0);
    if (game.imperialMandates?.hydrateState) game.imperialMandates.hydrateState(snapshot.mandates, game);
    game.pendingNotifications = Array.isArray(snapshot.notifications) ? snapshot.notifications : [];
    game.syncReclamationAwaitState();
    game.updateSaveStatus(snapshot.stats?.lastSaveISO ? `Loaded ${snapshot.stats.lastSaveISO}` : 'Loaded save file');
    game.showOverworldUI();
    game.shouldRunImperialIntro = false;
}

/**
 * Normalize starter tile ownership and rebuild adjacency cache so the inspector
 * can reference fresh cluster data as soon as the campaign boots.
 * @param {object} game live Game instance.
 * @returns {Map<string, object>} cluster bonus map keyed by hex key.
 */
export function finalizeStarterTerritory(game) {
    if (game.overworld?.hexes instanceof Map) {
        game.overworld.hexes.forEach((tile) => {
            if (tile && !tile.owner) tile.owner = 'player';
        });
    }
    return game.refreshClusterBonuses();
}

/**
 * Rebuild the adjacency bonus cache for overworld income and UI consumers.
 * @param {object} game live Game instance.
 * @returns {Map<string, object>} latest cluster bonus map keyed by hex key.
 */
export function refreshClusterBonuses(game) {
    const baseRate = game.research?.bonuses?.clusterBaseRate ?? DEFAULT_CLUSTER_RATE;
    const reclamationRate = game.research?.bonuses?.landReclamationClusterBonus ?? 0;
    const bonuses = buildClusterBonusMap(game.overworld?.hexes, { baseRate, reclamationRate });
    game.overworld.clusterBonuses = bonuses;
    return bonuses;
}

/**
 * Track claimable frontier tiles surrounding owned territory.
 * @param {object} game live Game instance.
 */
export function calcOverworldGhosts(game) {
    game.overworld.claimable.clear();
    for (const [, tile] of game.overworld.hexes) {
        for (let i = 0; i < 6; i += 1) {
            const neighbor = game.Hex.neighbor(tile.hex, i);
            if (!game.overworld.hexes.has(neighbor.toString())) {
                const dist = game.Hex.distance(new game.Hex(0, 0), neighbor);
                game.overworld.claimable.set(neighbor.toString(), Math.floor(12 + dist * 6));
            }
        }
    }
}

/**
 * Advance the overworld timers and surface mandate events.
 * @param {object} game live Game instance.
 * @param {number} dt frame delta in seconds.
 */
export function updateOverworld(game, dt) {
    advanceOverworldTimer(game, dt, {
        mandateManager: game.imperialMandateManager,
        imperialMandates: game.imperialMandates,
        uiBindings: {
            showTileCallout: game.showTileCallout,
            hideTileCallout: game.hideTileCallout,
            enqueueNotification: game.enqueueNotification
        }
    });
}

/**
 * Determine whether debug overlays should stamp claim costs onto frontier tiles.
 * @param {object} game live Game instance.
 * @returns {boolean} true when claim cost labels should render.
 */
export function shouldShowClaimCostLabels(game) {
    const toggle = game.featureToggles?.overworld?.showClaimCosts;
    const debugToggle = (typeof window !== 'undefined' && window.DebugToggles)
        ? window.DebugToggles.showClaimCosts
        : false;
    return Boolean(toggle || debugToggle);
}

/**
 * Shade a single hex according to its visibility state.
 * @param {object} game live Game instance.
 * @param {Hex} hex tile coordinate being rendered.
 * @param {Object} tile raw tile payload from map iteration.
 * @param {string} visibility normalized tile visibility label.
 */
export function drawTileVisibilityMask(game, hex, tile, visibility) {
    const layout = game.snow?.hexLayout;
    if (!layout || !hex || typeof hex.toPixel !== 'function') return;

    const state = visibility || game.resolveHexVisibility(hex);
    if (state === TILE_VISIBILITY.VISIBLE) return;

    const ctx = game.ctx;
    const center = hex.toPixel(layout);
    const maskSize = Math.max(4 * game.cam.zoom, layout.size - Math.max(2.5 * game.cam.zoom, layout.size * 0.08));

    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
        const angle = 2 * Math.PI / 6 * (i + 0.5);
        const x = center.x + maskSize * Math.cos(angle);
        const y = center.y + maskSize * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();

    if (state === TILE_VISIBILITY.UNSEEN) {
        ctx.fillStyle = 'rgba(5, 6, 12, 0.9)';
        ctx.fill();
        ctx.restore();
        return;
    }

    const gradient = ctx.createRadialGradient(center.x, center.y, maskSize * 0.1, center.x, center.y, maskSize);
    gradient.addColorStop(0, 'rgba(32, 38, 46, 0.38)');
    gradient.addColorStop(1, 'rgba(12, 14, 18, 0.6)');

    const originalComposite = ctx.globalCompositeOperation;
    const originalAlpha = ctx.globalAlpha;
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = 'rgba(132, 138, 148, 1)';
    ctx.fill();
    ctx.globalAlpha = originalAlpha;
    ctx.globalCompositeOperation = originalComposite;
    ctx.restore();
}

/**
 * Render overworld tiles with optional claim cost overlays and visibility masks.
 * @param {object} game live Game instance.
 * @param {object} layout active hex layout definition.
 */
export function drawOverworld(game, layout) {
    const tileVisibility = game.snow?.visibility instanceof Map
        ? game.snow.visibility
        : game.getTileVisibilityMap();
    game.snow.hexLayout = layout;
    drawOverworldTiles(game.overworld, {
        layout,
        drawHex: (...args) => game.drawHex(...args),
        parseKey: (key) => game.parseKey(key),
        drawTileOverlay: (hex, tile, visibility) => drawTileVisibilityMask(game, hex, tile, visibility),
        showClaimCosts: shouldShowClaimCostLabels(game),
        tileVisibility
    });
}

/**
 * Queue a land reclamation placement so the player can pick which field to upgrade.
 * @param {object} game live Game instance.
 * @param {string} targetType desired conversion target (forest|town).
 * @param {object} cost payment to reserve for when a valid tile is selected.
 */
export function queueLandReclamation(game, targetType, cost = {}) {
    const normalized = targetType === 'town' ? 'town' : 'forest';
    if (!Array.isArray(game.pendingReclamations)) game.pendingReclamations = [];
    const tech = game.getTech('land-reclamation');
    if (tech) tech.pendingPlacements = Math.max(0, tech.pendingPlacements || 0) + 1;
    game.pendingReclamations.push({ targetType: normalized, cost, techId: 'land-reclamation' });
    if (typeof game.updateTileInspector === 'function') game.updateTileInspector(game.selectedOverworldTile);
    game.syncReclamationAwaitState();
    game.updateReclamationPromptFromQueue();
    return game.pendingReclamations.length;
}

/** Peek at the next queued reclamation target type. */
export function nextQueuedReclamationType(game) {
    const pending = Array.isArray(game.pendingReclamations) && game.pendingReclamations[0];
    return pending?.targetType || null;
}

/** Peek at the pending reclamation cost. */
export function nextQueuedReclamationCost(game) {
    const pending = Array.isArray(game.pendingReclamations) && game.pendingReclamations[0];
    return pending?.cost || null;
}

/** True when at least one field can be reclaimed. */
export function hasFieldToConvert(game) {
    return Array.from(game.overworld.hexes.values())
        .some(h => h.type === 'field' && (!h.owner || h.owner === 'player'));
}

/**
 * Convert a player-controlled field into the requested tile type.
 * @param {object} game live Game instance.
 * @param {object} tile overworld tile payload selected by the player.
 * @param {Hex} [fallbackHex] optional hex for error messaging when tile is missing.
 * @returns {boolean} true when a conversion occurred.
 */
export function applyQueuedReclamationToTile(game, tile, fallbackHex) {
    const pending = Array.isArray(game.pendingReclamations) && game.pendingReclamations[0];
    const HexImpl = game.Hex;
    const anchorHex = (tile && tile.hex) || fallbackHex || game.selectedOverworldTile?.hex || new HexImpl(0, 0, 0);
    const notify = (msg, col = '#ef476f') => {
        if (typeof game.spawnTxt === 'function') game.spawnTxt(anchorHex, msg, col);
    };

    if (!pending) {
        notify('No reclamation charges available');
        game.syncReclamationAwaitState();
        return false;
    }

    const hasEligibleField = typeof game.hasFieldToConvert === 'function' ? game.hasFieldToConvert() : hasFieldToConvert(game);
    if (!hasEligibleField) {
        game.pendingReclamations.length = 0;
        const techRef = game.getTech('land-reclamation');
        if (techRef) techRef.pendingPlacements = 0;
        notify('No player fields remain to reclaim');
        game.syncReclamationAwaitState();
        game.updateReclamationPromptFromQueue();
        if (typeof game.updateTileInspector === 'function') game.updateTileInspector(tile || game.selectedOverworldTile);
        return false;
    }

    if (!tile || tile.type !== 'field') {
        notify('Select an owned FIELD to convert');
        game.syncReclamationAwaitState();
        game.updateReclamationPromptFromQueue();
        if (typeof game.updateTileInspector === 'function') game.updateTileInspector(tile || game.selectedOverworldTile);
        return false;
    }
    if (tile.owner && tile.owner !== 'player') {
        notify('Enemy territory cannot be reclaimed');
        game.syncReclamationAwaitState();
        game.updateReclamationPromptFromQueue();
        if (typeof game.updateTileInspector === 'function') game.updateTileInspector(tile);
        return false;
    }

    const targetType = pending.targetType === 'town' ? 'town' : 'forest';
    const cost = pending.cost || { gold: 0 };
    if (!game.canPayCost({ gold: cost.gold || 0 })) {
        notify('Need more gold to reclaim');
        game.syncReclamationAwaitState();
        game.updateReclamationPromptFromQueue();
        if (typeof game.updateTileInspector === 'function') game.updateTileInspector(tile || game.selectedOverworldTile);
        return false;
    }

    tile.type = targetType;
    tile.owner = tile.owner || 'player';
    tile.wasReclaimed = true;
    game.calcOverworldGhosts();

    game.pendingReclamations.shift();
    const tech = game.getTech('land-reclamation');
    if (tech && tech.pendingPlacements) tech.pendingPlacements = Math.max(0, tech.pendingPlacements - 1);

    game.gold -= cost.gold || 0;
    if (game.researchSystemRef && typeof game.researchSystemRef.recordPurchase === 'function' && tech) {
        game.researchSystemRef.recordPurchase(tech);
    }
    game.updateResearchBonuses();
    game.refreshClusterBonuses();
    game.spawnTxt(tile.hex, `${targetType.toUpperCase()} RECLAIMED`, targetType === 'town' ? '#ffd166' : '#8ae7a8');
    if (typeof game.updateTileInspector === 'function') game.updateTileInspector(tile);
    game.updateHUD();
    game.updateResearchUI?.();
    game.updateReclamationPromptFromQueue();
    game.syncReclamationAwaitState();
    return true;
}

/**
 * Set and broadcast the reclamation targeting state so the UI and click handlers
 * know a player decision is required for placement.
 * @param {object} game live Game instance.
 * @returns {boolean} true when at least one reclamation charge remains.
 */
export function syncReclamationAwaitState(game) {
    const hasPending = Array.isArray(game.pendingReclamations) && game.pendingReclamations.length > 0;
    game.awaitingReclamationTarget = hasPending;
    if (hasPending) game.updateReclamationPromptFromQueue();
    else if (typeof game.updateTileInspector === 'function') game.updateTileInspector(game.selectedOverworldTile);
    if (!hasPending) {
        const techRef = game.getTech('land-reclamation');
        if (techRef) techRef.pendingPlacements = 0;
        game.setReclamationPrompt('');
    }
    return hasPending;
}

/** Surface a HUD-level hint while queued reclamations await tile targeting. */
export function setReclamationPrompt(game, message) {
    const hint = typeof document !== 'undefined' ? document.getElementById('reclamation-hint') : null;
    if (!hint) return false;
    const hasMessage = Boolean(message);
    hint.innerText = message || '';
    hint.setAttribute('aria-hidden', hasMessage ? 'false' : 'true');
    return hasMessage;
}

/** Refresh the reclamation prompt text using the next queued cost/target for clarity. */
export function updateReclamationPromptFromQueue(game) {
    const pendingType = game.nextQueuedReclamationType();
    const pendingCost = game.nextQueuedReclamationCost();
    if (!pendingType || !pendingCost) return game.setReclamationPrompt('');
    const costLabel = game.formatCost(pendingCost) || '0g';
    return game.setReclamationPrompt(`Select an owned FIELD tile to convert (pay ${costLabel} on placement)`);
}

/**
 * Collapse the research drawer, flag the awaiting state, and float a prompt
 * so the player knows to pick a target field immediately after purchase.
 * @param {object} game live Game instance.
 */
export function enterReclamationTargetingState(game) {
    game.syncReclamationAwaitState();
    if (typeof game.toggleResearch === 'function') game.toggleResearch(false);
    game.updateReclamationPromptFromQueue();
    const x = game.viewport?.width ? game.viewport.width / 2 : 0;
    const y = Math.max(48, (game.viewport?.height || 0) * 0.18);
    const costLabel = game.formatCost(game.nextQueuedReclamationCost() || { gold: 0 }) || '0g';
    const message = `Select a field to convert (${costLabel} due on placement).`;
    if (typeof game.showFloatingText === 'function') {
        game.showFloatingText(x, y, message, 'alert-text');
    } else {
        game.spawnTxt(new game.Hex(0, 0), message, '#9be3b4');
    }
    if (typeof game.spawnTxt === 'function') {
        game.spawnTxt(new game.Hex(0, 0), 'Click a player field to reclaim.', '#9be3b4');
    }
}

/**
 * Track a claimed overworld hex with configurable ownership and metadata for hostile discoveries.
 * @param {object} game live Game instance.
 * @param {object} hex axial coordinate of the tile.
 * @param {string} type tile terrain identifier.
 * @param {string} [owner='player'] controlling faction key.
 * @param {object} [extras={}] optional additional properties to merge onto the tile payload.
 * @returns {object} the stored tile record.
 */
export function addOverworldHex(game, hex, type, owner = 'player', extras = {}) {
    const record = { hex, type, owner, ...extras };
    game.overworld.hexes.set(hex.toString(), record);
    return record;
}

/**
 * Claim logic for free or paid tiles, including rebel discovery chance.
 * @param {object} game live Game instance.
 * @param {object} hex axial coordinate to claim.
 * @param {boolean} free whether the claim should cost resources.
 */
export function claimHexLogic(game, hex, free) {
    const rebelSpawnChance = free ? 0 : 0.10 + (Math.random() * 0.05);
    const shouldSpawnRebels = !free && Math.random() < rebelSpawnChance;

    if (shouldSpawnRebels) {
        const rebelTile = addOverworldHex(game, hex, 'rebelcamp', 'rebel', { prevType: 'field', isRebelCamp: true });
        game.spawnTxt(hex, '🏴 REBEL CAMP!', '#f55');
        if (typeof game.playSound === 'function') game.playSound('alert');
        game.refreshClusterBonuses();
        return rebelTile;
    }

    const weighted = [
        { type: 'field', weight: 40 },
        { type: 'forest', weight: 28 },
        { type: 'town', weight: 16 },
        { type: 'mine', weight: 5 },
        { type: 'shrine', weight: 2 },
        { type: 'ruin', weight: 1 },
        { type: 'water', weight: 8 }
    ];
    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let pick = Math.random() * totalWeight;
    let type = 'field';
    for (const entry of weighted) {
        if (pick < entry.weight) { type = entry.type; break; }
        pick -= entry.weight;
    }

    const def = OVERWORLD_TILES[type.toUpperCase()];
    const extras = type === 'water' ? { isWater: true } : {};
    addOverworldHex(game, hex, type, 'player', extras);

    if (type === 'water') {
        const body = buildWaterBody(hex, { rng: Math.random });
        const stamped = stampWaterBody(game, hex, body, { owner: 'player' });
        const totalWater = (stamped?.length || 0) + 1;
        if (!free) {
            const headline = def?.char ? `${def.char} WATER!` : 'WATER!';
            game.spawnTxt(hex, headline, '#74c0fc');
            if (totalWater > 1) game.spawnTxt(hex, `+${totalWater - 1} hex water body`, '#74c0fc');
        }
    } else if (!free) {
        const label = def?.char ? `${def.char} ${type.toUpperCase()}!` : `${type.toUpperCase()}!`;
        game.spawnTxt(hex, label, '#fff');
        if (type === 'town') game.playSound('city');
        else if (type === 'forest') game.playSound('choptree');
        else if (type === 'mine') game.playSound('gold');
        else if (type === 'shrine') game.playSound('holy');
    }

    if (def?.onClaim && !free) def.onClaim(game, hex);
    if (!free) game.refreshClusterBonuses();
    return def;
}
