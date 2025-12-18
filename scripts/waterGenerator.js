import { OVERWORLD_TILES } from './overworldConfig.js';

const DIRECTIONS = [
    { q: 1, r: 0, s: -1 },
    { q: 1, r: -1, s: 0 },
    { q: 0, r: -1, s: 1 },
    { q: -1, r: 0, s: 1 },
    { q: -1, r: 1, s: 0 },
    { q: 0, r: 1, s: -1 }
];

function normalizeHex(hex) {
    if (!hex) return { q: 0, r: 0, s: 0 };
    return {
        q: hex.q || 0,
        r: hex.r || 0,
        s: Number.isFinite(hex.s) ? hex.s : -(hex.q || 0) - (hex.r || 0)
    };
}

function toKey(hex) {
    const normalized = normalizeHex(hex);
    return `${normalized.q},${normalized.r}`;
}

function addHex(a, b) {
    const origin = normalizeHex(a);
    const offset = normalizeHex(b);
    return normalizeHex({ q: origin.q + offset.q, r: origin.r + offset.r, s: origin.s + offset.s });
}

function pickDirection(rng) {
    return Math.floor(rng() * DIRECTIONS.length) % DIRECTIONS.length;
}

function shuffle(array, rng) {
    for (let i = array.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function generateLake(startHex, targetSize, rng) {
    const queue = [startHex];
    const tiles = new Map([[toKey(startHex), startHex]]);

    while (tiles.size < targetSize && queue.length) {
        const anchor = queue.shift();
        const neighbors = shuffle(
            DIRECTIONS.map((dir) => addHex(anchor, dir)).filter((candidate) => !tiles.has(toKey(candidate))),
            rng
        );

        for (const neighbor of neighbors) {
            tiles.set(toKey(neighbor), neighbor);
            if (tiles.size >= targetSize) break;
            queue.push(neighbor);
        }
    }

    // Fill any remaining slots by fanning out from existing picks to keep blobs roundish.
    while (tiles.size < targetSize) {
        const existing = Array.from(tiles.values());
        const anchor = existing[Math.floor(rng() * existing.length)];
        const neighbor = addHex(anchor, DIRECTIONS[pickDirection(rng)]);
        tiles.set(toKey(neighbor), neighbor);
    }

    return Array.from(tiles.values());
}

function generateRiver(startHex, length, rng) {
    const tiles = new Map([[toKey(startHex), startHex]]);
    let current = startHex;
    let direction = pickDirection(rng);

    for (let i = 1; i < length; i += 1) {
        if (rng() < 0.35) {
            const turn = rng() < 0.5 ? -1 : 1;
            direction = (direction + turn + DIRECTIONS.length) % DIRECTIONS.length;
        }
        current = addHex(current, DIRECTIONS[direction]);
        tiles.set(toKey(current), current);
    }

    return Array.from(tiles.values());
}

/**
 * Build a random water body starting from a newly revealed tile. The generator
 * creates either a short, winding river or a compact lake to ensure a single
 * claimed water hex reveals additional "dead space" and environmental variety.
 *
 * @param {object} startHex axial coordinate of the unlocked tile.
 * @param {object} [options]
 * @param {function} [options.rng=Math.random] injectable RNG for determinism in tests.
 * @param {[number, number]} [options.riverLengthRange=[4, 9]] inclusive bounds for river lengths.
 * @param {[number, number]} [options.lakeSizeRange=[3, 6]] inclusive bounds for lake blob size.
 * @returns {object[]} array of axial hexes forming the water body (includes start).
 */
export function buildWaterBody(startHex, options = {}) {
    const rng = typeof options.rng === 'function' ? options.rng : Math.random;
    const riverBounds = options.riverLengthRange || [4, 9];
    const lakeBounds = options.lakeSizeRange || [3, 6];
    const buildRiver = rng() < 0.5;

    if (buildRiver) {
        const min = Math.max(2, Math.floor(riverBounds[0] || 2));
        const max = Math.max(min + 1, Math.floor(riverBounds[1] || 6));
        const length = Math.floor(rng() * (max - min + 1)) + min;
        return generateRiver(startHex, length, rng);
    }

    const minLake = Math.max(2, Math.floor(lakeBounds[0] || 3));
    const maxLake = Math.max(minLake, Math.floor(lakeBounds[1] || 5));
    const targetSize = Math.floor(rng() * (maxLake - minLake + 1)) + minLake;
    return generateLake(startHex, targetSize, rng);
}

/**
 * Merge a generated water body into the overworld, skipping coordinates that
 * already contain tiles to avoid clobbering existing terrain.
 *
 * @param {object} game game instance exposing addOverworldHex and overworld hex map.
 * @param {object} startHex axial coordinate that triggered the reveal.
 * @param {object[]} body array of axial coordinates returned by {@link buildWaterBody}.
 * @param {object} [options] optional flags for owner/metadata.
 */
export function stampWaterBody(game, startHex, body, options = {}) {
    if (!game || !game.addOverworldHex || !body) return [];
    const Hex = game.Hex;
    const owner = options.owner || 'player';
    const claimed = [];

    body.forEach((rawHex) => {
        const normalized = normalizeHex(rawHex);
        const key = `${normalized.q},${normalized.r}`;
        if (game.overworld?.hexes?.has?.(key)) return;
        const hexInstance = typeof Hex === 'function' ? new Hex(normalized.q, normalized.r, normalized.s) : normalized;
        claimed.push(game.addOverworldHex(hexInstance, OVERWORLD_TILES.WATER.id, owner, { isWater: true }));
    });

    // Ensure the triggering tile retains its water metadata when provided.
    const startKey = startHex?.toString?.() || `${startHex?.q ?? 0},${startHex?.r ?? 0}`;
    if (startKey && game.overworld?.hexes?.has?.(startKey)) {
        const tile = game.overworld.hexes.get(startKey);
        if (tile) tile.isWater = true;
    }

    return claimed;
}

export default buildWaterBody;
