/**
 * Real-world overworld helpers that map lat/lon coordinates to axial hexes and
 * synthesize a tile classification from pseudo-satellite signals. The goal is
 * to make real-world claiming deterministic and extensible while the true data
 * pipeline is still a moonshot.
 */

export const REAL_WORLD_HEX_CONFIG = {
    hexFaceMeters: 10,
    approxHexSpacingMeters: 250,
    earthRadiusMeters: 6371000
};

const DEFAULT_PROVIDER_ID = 'synthetic-satellite';

/**
 * Convert degrees to radians.
 * @param {number} degrees angle in degrees.
 * @returns {number} angle in radians.
 */
export function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
}

/**
 * Normalize latitude/longitude input while guarding against non-finite values.
 * @param {{lat: number, lon: number}} position raw coordinates.
 * @returns {{lat: number, lon: number}} sanitized coordinates.
 */
export function normalizeLatLon(position) {
    const lat = Number.isFinite(position?.lat) ? position.lat : 0;
    const lon = Number.isFinite(position?.lon) ? position.lon : 0;
    return { lat, lon };
}

/**
 * Round axial coordinates to the nearest hex cell.
 * @param {{q: number, r: number, s: number}} axial coordinate in cube space.
 * @returns {{q: number, r: number, s: number}} rounded cube coordinate.
 */
export function roundAxial({ q, r, s }) {
    let qi = Math.round(q);
    let ri = Math.round(r);
    let si = Math.round(s);
    const qDiff = Math.abs(qi - q);
    const rDiff = Math.abs(ri - r);
    const sDiff = Math.abs(si - s);
    if (qDiff > rDiff && qDiff > sDiff) qi = -ri - si;
    else if (rDiff > sDiff) ri = -qi - si;
    else si = -qi - ri;
    return { q: qi, r: ri, s: si };
}

/**
 * Convert projected meters into axial coordinates for a pointy-top hex grid.
 * @param {{x: number, y: number}} meters local meters east/north.
 * @param {number} hexSizeMeters hex radius in meters.
 * @returns {{q: number, r: number, s: number}} axial coordinate in cube space.
 */
export function metersToAxial({ x, y }, hexSizeMeters) {
    const safeSize = Number.isFinite(hexSizeMeters) && hexSizeMeters > 0
        ? hexSizeMeters
        : REAL_WORLD_HEX_CONFIG.approxHexSpacingMeters;
    const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / safeSize;
    const r = ((2 / 3) * y) / safeSize;
    return roundAxial({ q, r, s: -q - r });
}

/**
 * Convert axial coordinates to projected meter offsets for a pointy-top grid.
 * @param {{q: number, r: number}} axial coordinate in cube space.
 * @param {number} hexSizeMeters hex radius in meters.
 * @returns {{x: number, y: number}} local meter offsets.
 */
export function axialToMeters({ q, r }, hexSizeMeters) {
    const safeSize = Number.isFinite(hexSizeMeters) && hexSizeMeters > 0
        ? hexSizeMeters
        : REAL_WORLD_HEX_CONFIG.approxHexSpacingMeters;
    const x = safeSize * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = safeSize * ((3 / 2) * r);
    return { x, y };
}

/**
 * Build a deterministic pseudo-random value from a lat/lon seed.
 * @param {number} lat latitude in degrees.
 * @param {number} lon longitude in degrees.
 * @param {number} salt numeric salt for variation.
 * @returns {number} value normalized to [0, 1].
 */
export function seededSignal(lat, lon, salt) {
    const seed = Math.sin((lat + 37.7) * 12.9898 + (lon - 122.4) * 78.233 + salt) * 43758.5453;
    return seed - Math.floor(seed);
}

/**
 * Derive synthetic satellite-like signals from location data.
 * @param {{lat: number, lon: number}} position coordinate in degrees.
 * @returns {{elevation: number, moisture: number, urban: number, ruggedness: number, sacred: number}}
 * signal values normalized to [0, 1].
 */
export function deriveSatelliteSignal(position) {
    const { lat, lon } = normalizeLatLon(position);
    const elevation = seededSignal(lat, lon, 11);
    const moisture = seededSignal(lat, lon, 29);
    const urban = seededSignal(lat, lon, 47);
    const ruggedness = seededSignal(lat, lon, 59);
    const sacred = seededSignal(lat, lon, 83);
    return { elevation, moisture, urban, ruggedness, sacred };
}

/**
 * Choose a terrain tile based on synthetic satellite signals.
 * @param {{elevation: number, moisture: number, urban: number, ruggedness: number, sacred: number}} signal
 * derived signal inputs.
 * @returns {{type: string, tags: string[]}} terrain choice and tag hints.
 */
export function selectSatelliteTileType(signal) {
    const tags = [];
    if (signal.elevation < 0.18) return { type: 'water', tags: ['hydrology'] };
    if (signal.urban > 0.78 && signal.moisture < 0.65) return { type: 'town', tags: ['settlement'] };
    if (signal.ruggedness > 0.82) return { type: 'mine', tags: ['mineral'] };
    if (signal.sacred > 0.88) return { type: 'shrine', tags: ['ritual'] };
    if (signal.moisture > 0.62 && signal.elevation > 0.25) return { type: 'forest', tags: ['canopy'] };
    if (signal.elevation > 0.68 && signal.ruggedness > 0.55) return { type: 'ruin', tags: ['ancient'] };
    return { type: 'field', tags: ['grassland'] };
}

/**
 * Default provider that emulates a satellite-derived terrain classification.
 * @param {{lat: number, lon: number, axialKey?: string}} position metadata.
 * @returns {{type: string, tags: string[], source: string, signal: object}}
 * normalized tile output from the synthetic provider.
 */
export function defaultRealWorldProvider({ lat, lon, axialKey }) {
    const signal = deriveSatelliteSignal({ lat, lon });
    const tile = selectSatelliteTileType(signal);
    return {
        ...tile,
        source: DEFAULT_PROVIDER_ID,
        signal: { ...signal, axialKey }
    };
}

/**
 * Index that converts lat/lon pairs into axial coordinates and resolves
 * terrain types using a configurable provider.
 */
export class RealWorldOverworldIndex {
    /**
     * @param {object} [options]
     * @param {{lat: number, lon: number}} [options.origin] origin used to anchor the local projection.
     * @param {number} [options.hexSizeMeters] hex radius in meters for the grid.
     * @param {function} [options.provider] tile resolver that accepts {lat, lon, axialKey}.
     * @param {number} [options.cacheLimit=5000] maximum cached hex entries.
     */
    constructor({
        origin = { lat: 0, lon: 0 },
        hexSizeMeters = REAL_WORLD_HEX_CONFIG.approxHexSpacingMeters,
        provider = defaultRealWorldProvider,
        cacheLimit = 5000
    } = {}) {
        this.origin = normalizeLatLon(origin);
        this.hexSizeMeters = Number.isFinite(hexSizeMeters) && hexSizeMeters > 0
            ? hexSizeMeters
            : REAL_WORLD_HEX_CONFIG.approxHexSpacingMeters;
        this.provider = typeof provider === 'function' ? provider : defaultRealWorldProvider;
        this.cacheLimit = Number.isFinite(cacheLimit) && cacheLimit > 0 ? cacheLimit : 5000;
        this.cache = new Map();
    }

    /**
     * Update the projection origin for the real-world grid.
     * @param {{lat: number, lon: number}} origin updated origin coordinates.
     */
    setOrigin(origin) {
        this.origin = normalizeLatLon(origin);
        this.cache.clear();
    }

    /**
     * Update the hex size and clear cached entries to avoid stale projection data.
     * @param {number} hexSizeMeters new hex radius in meters.
     */
    setHexSize(hexSizeMeters) {
        this.hexSizeMeters = Number.isFinite(hexSizeMeters) && hexSizeMeters > 0
            ? hexSizeMeters
            : REAL_WORLD_HEX_CONFIG.approxHexSpacingMeters;
        this.cache.clear();
    }

    /**
     * Convert lat/lon into axial coordinates anchored at the current origin.
     * @param {{lat: number, lon: number}} position coordinates in degrees.
     * @returns {{q: number, r: number, s: number}} axial coordinate for the grid.
     */
    latLonToAxial(position) {
        const { lat, lon } = normalizeLatLon(position);
        const originRad = toRadians(this.origin.lat);
        const x = toRadians(lon - this.origin.lon) * Math.cos(originRad) * REAL_WORLD_HEX_CONFIG.earthRadiusMeters;
        const y = toRadians(lat - this.origin.lat) * REAL_WORLD_HEX_CONFIG.earthRadiusMeters;
        return metersToAxial({ x, y }, this.hexSizeMeters);
    }

    /**
     * Convert axial coordinates back to lat/lon using the current origin.
     * @param {{q: number, r: number}} axial coordinate to map.
     * @returns {{lat: number, lon: number}} lat/lon of the hex center.
     */
    axialToLatLon(axial) {
        const { x, y } = axialToMeters(axial, this.hexSizeMeters);
        const originLatRad = toRadians(this.origin.lat);
        const lat = this.origin.lat + (y / REAL_WORLD_HEX_CONFIG.earthRadiusMeters) * (180 / Math.PI);
        const lon = this.origin.lon + (x / (REAL_WORLD_HEX_CONFIG.earthRadiusMeters * Math.cos(originLatRad))) * (180 / Math.PI);
        return { lat, lon };
    }

    /**
     * Resolve a terrain tile for a lat/lon position with caching.
     * @param {{lat: number, lon: number}} position coordinates in degrees.
     * @returns {{hex: {q: number, r: number, s: number}, tile: {type: string, tags: string[], source: string, signal: object}}}
     * hex coordinate and resolved tile payload.
     */
    resolveTileForLatLon(position) {
        const axial = this.latLonToAxial(position);
        const key = `${axial.q},${axial.r}`;
        if (this.cache.has(key)) return this.cache.get(key);
        const tile = this.provider({ ...position, axialKey: key });
        const payload = { hex: axial, tile };
        this.cache.set(key, payload);
        if (this.cache.size > this.cacheLimit) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }
        return payload;
    }
}

export default RealWorldOverworldIndex;
