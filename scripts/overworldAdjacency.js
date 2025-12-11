import { OVERWORLD_TILES } from './overworldConfig.js';

/**
 * Normalize an overworld hex or tile into a canonical axial key.
 * Returns null when either coordinate is missing so callers can guard
 * against incomplete data.
 *
 * @param {object} hexOrTile hex coordinate or tile containing a `hex` field.
 * @returns {string|null} normalized "q,r" key or null when invalid.
 */
export function normalizeOverworldHexKey(hexOrTile) {
    const hex = hexOrTile?.hex ?? hexOrTile;
    const q = Number.isFinite(hex?.q) ? hex.q : null;
    const r = Number.isFinite(hex?.r) ? hex.r : null;
    if (q === null || r === null) return null;
    return `${q},${r}`;
}

/**
 * Default adjacency bonus rate applied per additional tile in a contiguous cluster.
 * The rate compounds with cluster size but is independent of research bonuses.
 */
export const DEFAULT_CLUSTER_RATE = 0.1;

const NEIGHBORS = [
    { q: 1, r: 0, s: -1 },
    { q: 1, r: -1, s: 0 },
    { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 },
    { q: -1, r: 1, s: 0 },
    { q: 0, r: 1, s: -1 }
];

function getNeighborKeys(hex) {
    if (!Number.isFinite(hex?.q) || !Number.isFinite(hex?.r)) return [];
    return NEIGHBORS.map((offset) => ({ q: hex.q + offset.q, r: hex.r + offset.r, s: (hex.s ?? -hex.q - hex.r) + offset.s }));
}

function isClusterEligible(tile) {
    if (!tile) return false;
    const owner = (tile.owner || 'player').toLowerCase();
    if (owner === 'rebel' || owner === 'scorched') return false;
    return Boolean(tile.type && normalizeOverworldHexKey(tile));
}

function floodFillCluster(hexes, startKey, startTile, visited) {
    const queue = [startKey];
    const members = [];
    const targetType = startTile.type;
    const targetOwner = (startTile.owner || 'player').toLowerCase();

    while (queue.length) {
        const key = queue.shift();
        if (visited.has(key)) continue;
        visited.add(key);

        const current = hexes.get(key);
        if (!isClusterEligible(current)) continue;
        const owner = (current.owner || 'player').toLowerCase();
        if (current.type !== targetType || owner !== targetOwner) continue;

        members.push(key);
        const neighbors = getNeighborKeys(current.hex);
        neighbors.forEach((neighborHex) => {
            const neighborKey = normalizeOverworldHexKey(neighborHex);
            if (neighborKey && !visited.has(neighborKey) && hexes.has(neighborKey)) queue.push(neighborKey);
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
    const normalizedHexes = new Map();

    if (hexes instanceof Map) {
        hexes.forEach((tile) => {
            const key = normalizeOverworldHexKey(tile);
            if (key) normalizedHexes.set(key, tile);
        });
    }

    for (const [key, tile] of normalizedHexes) {
        if (visited.has(key)) continue;
        if (!isClusterEligible(tile)) {
            visited.add(key);
            continue;
        }

        const clusterMembers = floodFillCluster(normalizedHexes, key, tile, visited);
        const clusterSize = clusterMembers.length;
        const adjacencyRate = Math.max(0, clusterSize - 1) * baseRate;

        clusterMembers.forEach((memberKey) => {
            const memberTile = normalizedHexes.get(memberKey);
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
