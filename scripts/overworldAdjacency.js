import { OVERWORLD_TILES } from './overworldConfig.js';

/**
 * Default adjacency bonus rate applied per additional tile in a contiguous cluster.
 * The rate compounds with cluster size but is independent of research bonuses.
 */
export const DEFAULT_CLUSTER_RATE = 0.25;

const NEIGHBORS = [
    { q: 1, r: 0, s: -1 },
    { q: 1, r: -1, s: 0 },
    { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 },
    { q: -1, r: 1, s: 0 },
    { q: 0, r: 1, s: -1 }
];

function getNeighborKeys(hex) {
    return NEIGHBORS.map((offset) => ({ q: (hex?.q || 0) + offset.q, r: (hex?.r || 0) + offset.r }));
}

function isClusterEligible(tile) {
    if (!tile) return false;
    const owner = (tile.owner || 'player').toLowerCase();
    if (owner === 'rebel' || owner === 'scorched') return false;
    return Boolean(tile.type && tile.hex);
}

function floodFillCluster(hexes, startKey, startTile, visited) {
    const queue = [startKey];
    const enqueued = new Set(queue);
    const members = [];
    const targetType = startTile.type;
    const targetOwner = (startTile.owner || 'player').toLowerCase();

    while (queue.length) {
        const key = queue.shift();
        if (visited.has(key)) continue;

        const current = hexes.get(key);
        if (!isClusterEligible(current)) continue;
        const owner = (current.owner || 'player').toLowerCase();
        if (current.type !== targetType || owner !== targetOwner) continue;

        // Mark tiles as visited only when they belong to the active cluster so
        // mismatched neighbors can still seed their own clusters later.
        visited.add(key);
        members.push(key);
        const neighbors = getNeighborKeys(current.hex);
        neighbors.forEach((neighborHex) => {
            const neighborKey = `${neighborHex.q},${neighborHex.r}`;
            if (!visited.has(neighborKey) && !enqueued.has(neighborKey) && hexes.has(neighborKey)) {
                queue.push(neighborKey);
                enqueued.add(neighborKey);
            }
        });
    }

    return members;
}

/**
 * Evaluate adjacency-based income bonuses for each contiguous cluster of like tiles.
 *
 * The returned map contains entries for every eligible tile so UI and income code can
 * surface cluster size, total rate, and the resulting gold/wood contributions. Cluster
 * rates scale with size and can be augmented by land reclamation research.
 *
 * @param {Map<string, object>} hexes overworld tile map keyed by axial coordinates.
 * @param {object} [options] tuning overrides.
 * @param {number} [options.baseRate=DEFAULT_CLUSTER_RATE] multiplier applied per extra tile.
 * @param {number} [options.reclamationRate=0] bonus multiplier applied to reclaimed tiles.
 * @returns {Map<string, object>} map of tile key to computed cluster bonus payload.
 */
export function buildClusterBonusMap(hexes = new Map(), options = {}) {
    const baseRate = typeof options.baseRate === 'number' ? options.baseRate : DEFAULT_CLUSTER_RATE;
    const reclamationRate = typeof options.reclamationRate === 'number' ? Math.max(0, options.reclamationRate) : 0;
    const visited = new Set();
    const bonuses = new Map();

    for (const [key, tile] of hexes) {
        if (visited.has(key)) continue;
        if (!isClusterEligible(tile)) {
            visited.add(key);
            continue;
        }

        const clusterMembers = floodFillCluster(hexes, key, tile, visited);
        const clusterSize = clusterMembers.length;
        const adjacencyRate = Math.max(0, clusterSize - 1) * baseRate;

        clusterMembers.forEach((memberKey) => {
            const memberTile = hexes.get(memberKey);
            const def = OVERWORLD_TILES[memberTile?.type?.toUpperCase?.()] || {};
            const income = def.income || {};
            const reclaimedRate = memberTile?.wasReclaimed ? reclamationRate : 0;
            const totalRate = adjacencyRate + reclaimedRate;
            const goldBonus = income.gold ? Math.floor(income.gold * totalRate) : 0;
            const woodBonus = income.wood ? Math.floor(income.wood * totalRate) : 0;

            bonuses.set(memberKey, {
                type: memberTile?.type,
                owner: memberTile?.owner,
                size: clusterSize,
                adjacencyRate,
                reclamationRate: reclaimedRate,
                totalRate,
                goldBonus,
                woodBonus
            });
        });
    }

    return bonuses;
}

export default buildClusterBonusMap;
