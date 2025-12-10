import { OVERWORLD_TILES } from './overworldConfig.js';

/**
 * Attach stable UI metadata to a tile payload so HUD surfaces readable labels and tooltips.
 * @param {object} tile overworld tile payload to decorate.
 * @returns {object} mutated tile reference for chaining.
 */
export function decorateTileMetadata(tile = {}) {
    const def = OVERWORLD_TILES[tile.type?.toUpperCase?.()] || {};
    const baseIncome = def.income || {};
    const incomeParts = [];
    if (baseIncome.gold) incomeParts.push(`+${baseIncome.gold}g`);
    if (baseIncome.wood) incomeParts.push(`+${baseIncome.wood}w`);
    const baseTooltip = incomeParts.length
        ? `Base income: ${incomeParts.join(' ')}.`
        : 'No base income. Cluster bonuses may still apply when adjacent tiles match.';

    const prefix = def.char ? `${def.char} ` : '';
    const label = `${prefix}${(def.id || tile.type || 'tile').toUpperCase()}`;

    tile.label = label;
    tile.baseBonusTooltip = baseTooltip;
    tile.bonusTooltip = tile.bonusTooltip || baseTooltip;
    return tile;
}

function getTileKey(tile) {
    if (!tile) return null;
    if (tile.hex?.toString) return tile.hex.toString();
    if (typeof tile.toString === 'function') return tile.toString();
    const { q = 0, r = 0 } = tile.hex || {};
    return `${q},${r}`;
}

function resolveClusterBonus(game, tile) {
    const selection = tile || game?.selectedOverworldTile;
    const key = getTileKey(selection);
    if (!key) return null;
    if (selection?.clusterBonus) return selection.clusterBonus;
    const clusterMap = game?.overworld?.clusterBonuses;
    return clusterMap?.get?.(key) || null;
}

function formatAdjacencyBonus(cluster) {
    if (!cluster || cluster.size <= 0) return null;
    const bonusParts = [];
    if (cluster.goldBonus) bonusParts.push(`+${cluster.goldBonus}g`);
    if (cluster.woodBonus) bonusParts.push(`+${cluster.woodBonus}w`);
    const ratePct = Math.round((cluster.totalRate ?? cluster.adjacencyRate ?? 0) * 100);
    const bonusLabel = bonusParts.length ? ` worth ${bonusParts.join(' ')}` : '';
    return `${cluster.size}-tile cluster at +${ratePct}% adjacency${bonusLabel}`.trim();
}

/**
 * Generate HUD-friendly adjacency copy for the inspector using the cached cluster map.
 * @param {object} game live game instance containing overworld.clusterBonuses.
 * @param {object} tile tile payload currently under inspection.
 * @returns {{short: string, long: string}} summarized + detailed adjacency copy.
 */
export function describeAdjacencySummary(game, tile) {
    if (!tile) return { short: '', long: '' };
    const cluster = resolveClusterBonus(game, tile);
    if (!cluster) {
        return {
            short: 'Adjacency unknown',
            long: 'No adjacency data available yet. Explore nearby tiles to reveal cluster bonuses.'
        };
    }
    if (cluster.size <= 1) {
        return {
            short: 'No adjacency bonuses',
            long: 'This tile is isolated. Matching neighbors are needed to activate adjacency bonuses.'
        };
    }

    const bonusLabel = formatAdjacencyBonus(cluster);
    return {
        short: `Cluster bonuses active (${cluster.size}-tile)`,
        long: bonusLabel ? `Adjacency rate applies: ${bonusLabel}.` : 'Cluster bonuses are active for this tile.'
    };
}

/**
 * Compose a tile income/bonus description for the inspector, mutating tooltip metadata when needed.
 * @param {object} game live game instance containing overworld + pause state.
 * @param {object} tile tile payload currently under inspection.
 * @returns {string} formatted HUD line describing base and adjacency bonuses.
 */
export function describeTileBonus(game, tile) {
    if (!tile) return '';
    const decorated = decorateTileMetadata(tile);
    const def = OVERWORLD_TILES[decorated.type?.toUpperCase?.()] || {};
    const income = def.income || {};
    const baseIncome = [];
    if (income.gold) baseIncome.push(`+${income.gold}g`);
    if (income.wood) baseIncome.push(`+${income.wood}w`);
    const baseIncomeLabel = baseIncome.length ? baseIncome.join(' ') : 'No base income';

    const cluster = resolveClusterBonus(game, decorated);
    const clusterLabel = cluster ? formatAdjacencyBonus(cluster) : null;

    let summary = `${decorated.label} income: ${baseIncomeLabel}.`;
    if (cluster) {
        if (cluster.size <= 1) summary += ' No adjacency bonuses (isolated tile).';
        else summary += ` ${clusterLabel || `${cluster.size}-tile cluster active.`}`;
    }

    if (game?.paused) summary = `Production paused: ${summary}`;

    const tooltipLines = [decorated.baseBonusTooltip];
    if (cluster) {
        if (cluster.size <= 1) {
            tooltipLines.push('No adjacency bonuses: isolated tile (cluster size 1).');
        } else {
            const clusterLine = clusterLabel
                ? `Cluster size ${cluster.size}: ${clusterLabel}`
                : `Cluster size ${cluster.size}: adjacency bonuses currently inactive.`;
            tooltipLines.push(clusterLine);
        }
    }
    decorated.bonusTooltip = tooltipLines.filter(Boolean).join('\n');

    return summary;
}

export default {
    decorateTileMetadata,
    describeAdjacencySummary,
    describeTileBonus
};
