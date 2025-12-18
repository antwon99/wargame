import { OVERWORLD_TILES } from './overworldConfig.js';

/**
 * Default adjacency bonus rate applied per additional tile in a contiguous cluster.
 * The rate compounds with cluster size but is independent of research bonuses.
 */
export const DEFAULT_CLUSTER_RATE = 0.25;

/**
 * Default decay factor applied when calculating reverse adjacency efficiency.
 * Higher values cause bonuses to fall off more quickly as tiles move away from
 * the castle origin.
 */
export const DEFAULT_REVERSE_ADJACENCY_DECAY = 0.18;

/**
 * Minimum efficiency floor to prevent distant tiles from hitting zero income.
 */
export const MIN_REVERSE_ADJACENCY = 0.35;

/**
 * Number of rings around the castle that remain fully efficient before decay.
 */
export const REVERSE_ADJACENCY_SAFE_RADIUS = 1;

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

function normalizeHex(hex) {
    if (!hex) return { q: 0, r: 0, s: 0 };
    return {
        q: hex.q || 0,
        r: hex.r || 0,
        s: Number.isFinite(hex.s) ? hex.s : -(hex.q || 0) - (hex.r || 0)
    };
}

function cubeDistance(a, b) {
    const origin = normalizeHex(a);
    const target = normalizeHex(b);
    return (Math.abs(origin.q - target.q) + Math.abs(origin.r - target.r) + Math.abs(origin.s - target.s)) / 2;
}

function resolveOriginHex(hexes, origin) {
    if (origin) return normalizeHex(origin);
    for (const [, tile] of hexes) {
        if (tile?.type?.toLowerCase?.() === 'castle') return normalizeHex(tile.hex);
    }
    return { q: 0, r: 0, s: 0 };
}

/**
 * Calculate the reverse adjacency multiplier for a tile based on its distance
 * from the castle. Tiles within the configured safe radius keep full
 * efficiency; beyond that radius the multiplier decays toward a configurable
 * floor so even remote holdings contribute something.
 */
export function computeReverseAdjacencyMultiplier(
    distance,
    decay = DEFAULT_REVERSE_ADJACENCY_DECAY,
    floor = MIN_REVERSE_ADJACENCY,
    safeRadius = REVERSE_ADJACENCY_SAFE_RADIUS
) {
    const normalizedDecay = Math.max(0, decay);
    const sanitizedFloor = Math.max(0, Math.min(1, floor));
    if (!Number.isFinite(distance) || distance <= safeRadius) return 1;
    const adjustedDistance = Math.max(0, distance - safeRadius);
    const multiplier = 1 / (1 + adjustedDistance * normalizedDecay);
    return Math.max(sanitizedFloor, multiplier);
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
 * @param {object} [options.origin] optional castle coordinate; defaults to detected castle or (0,0).
 * @param {number} [options.reverseDecay=DEFAULT_REVERSE_ADJACENCY_DECAY] distance falloff factor.
 * @param {number} [options.reverseFloor=MIN_REVERSE_ADJACENCY] minimum efficiency for distant tiles.
 * @param {number} [options.safeRadius=REVERSE_ADJACENCY_SAFE_RADIUS] radius that keeps full adjacency.
 * @returns {Map<string, object>} map of tile key to computed cluster bonus payload.
 */
export function buildClusterBonusMap(hexes = new Map(), options = {}) {
    const baseRate = typeof options.baseRate === 'number' ? options.baseRate : DEFAULT_CLUSTER_RATE;
    const reclamationRate = typeof options.reclamationRate === 'number' ? Math.max(0, options.reclamationRate) : 0;
    const originHex = resolveOriginHex(hexes, options.origin);
    const reverseDecay = typeof options.reverseDecay === 'number' ? Math.max(0, options.reverseDecay) : DEFAULT_REVERSE_ADJACENCY_DECAY;
    const reverseFloor = typeof options.reverseFloor === 'number' ? options.reverseFloor : MIN_REVERSE_ADJACENCY;
    const safeRadius = typeof options.safeRadius === 'number' ? Math.max(0, options.safeRadius) : REVERSE_ADJACENCY_SAFE_RADIUS;
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
        const baseAdjacencyRate = Math.max(0, clusterSize - 1) * baseRate;

        clusterMembers.forEach((memberKey) => {
            const memberTile = hexes.get(memberKey);
            const def = OVERWORLD_TILES[memberTile?.type?.toUpperCase?.()] || {};
            const income = def.income || {};
            const reclaimedRate = memberTile?.wasReclaimed ? reclamationRate : 0;
            const distanceFromCastle = cubeDistance(memberTile?.hex, originHex);
            const reverseAdjacencyMultiplier = computeReverseAdjacencyMultiplier(
                distanceFromCastle,
                reverseDecay,
                reverseFloor,
                safeRadius
            );
            const adjacencyRate = baseAdjacencyRate * reverseAdjacencyMultiplier;
            const totalRate = adjacencyRate + reclaimedRate;
            const goldBonus = income.gold ? Math.floor(income.gold * totalRate) : 0;
            const woodBonus = income.wood ? Math.floor(income.wood * totalRate) : 0;

            bonuses.set(memberKey, {
                type: memberTile?.type,
                owner: memberTile?.owner,
                size: clusterSize,
                baseAdjacencyRate,
                distanceFromCastle,
                reverseAdjacencyMultiplier,
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
