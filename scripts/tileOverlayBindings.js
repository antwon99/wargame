/**
 * Tile overlay bindings manage the inspector, attack overlay, and tutorial callouts.
 * By isolating these DOM helpers we can test overworld UI affordances without pulling in
 * unrelated HUD or FX utilities.
 */

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
    const isHostile = !claimCost && (isRebelTile || tile.owner === 'enemy');
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

export { hideTileCallout, showTileCallout, updateTileAttackOverlay, updateTileInspector };
