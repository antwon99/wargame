/**
 * Resolve an optional tile mask for fog rendering without altering the current
 * backdrop visuals. This accepts either a precomputed mask or a provider
 * callback so callers can lazily generate frontier/unexplored tiles.
 *
 * @param {Object} options mask hooks
 * @param {Set<string>|Array<string>|Map<string, *>} [options.tileMask] optional precomputed mask
 * @param {Function} [options.tileMaskProvider] lazily produce a mask; receives { layout, state, overworld, combat, frontierOnly }
 * @param {boolean} [options.frontierOnly=false] whether the mask targets only frontier tiles
 * @param {Function} [options.onMaskResolved] optional callback receiving the resolved payload
 * @param {Object} [context] optional context information to pass through to provider/callback
 * @returns {{mask:Set<string>|Array<string>|Map<string, *>, maskType:string, frontierOnly:boolean, context:Object}|null}
 */
export function resolveFogTileMask(options = {}, context = {}) {
    const { tileMask, tileMaskProvider, frontierOnly = false, onMaskResolved } = options;
    const maskType = frontierOnly ? 'frontier' : 'unexplored';

    const mask = typeof tileMaskProvider === 'function'
        ? tileMaskProvider({ ...context, frontierOnly, maskType })
        : tileMask;

    const payload = mask ? { mask, maskType, frontierOnly: !!frontierOnly, context } : null;

    if (payload && typeof onMaskResolved === 'function') {
        onMaskResolved(payload);
    }

    return payload;
}

export const TILE_VISIBILITY = {
    UNSEEN: 'unseen',
    SEEN: 'seen',
    VISIBLE: 'visible'
};

const VISIBILITY_RANK = {
    [TILE_VISIBILITY.UNSEEN]: 0,
    [TILE_VISIBILITY.SEEN]: 1,
    [TILE_VISIBILITY.VISIBLE]: 2
};

/**
 * Normalize a map of tile visibility states derived from either the overworld or
 * combat context. Overworld tiles default to visible (owned) while frontier
 * claimables are treated as "seen" discoveries. Combat tiles are marked visible
 * only for player-owned territory; enemy/neutral cells fall back to a "seen"
 * state so fog systems can dim them without fully hiding layout data.
 *
 * @param {Object} [options] lookup sources for visibility signals.
 * @param {Map<string, *>} [options.overworld] explored overworld tile map.
 * @param {Map<string, *>} [options.claimable] claimable/frontier overworld tiles.
 * @param {Map<string, *>} [options.combat] active combat territory map.
 * @param {string} [options.state='OVERWORLD'] active game state (OVERWORLD|COMBAT).
 * @returns {Map<string, string>} map of tile keys to visibility state labels.
 */
export function buildTileVisibilityMap({ overworld, claimable, combat, state = 'OVERWORLD' } = {}) {
    const visibility = new Map();
    const promote = (key, level) => {
        const current = visibility.get(key) || TILE_VISIBILITY.UNSEEN;
        if (VISIBILITY_RANK[level] > VISIBILITY_RANK[current]) visibility.set(key, level);
    };

    if (overworld instanceof Map) {
        overworld.forEach((_, key) => promote(key, TILE_VISIBILITY.VISIBLE));
    }

    if (claimable instanceof Map) {
        claimable.forEach((_, key) => promote(key, TILE_VISIBILITY.SEEN));
    }

    if (state === 'COMBAT' && combat instanceof Map) {
        combat.forEach((tile, key) => {
            const owner = (tile?.owner || '').toLowerCase();
            const status = owner === 'player' ? TILE_VISIBILITY.VISIBLE : TILE_VISIBILITY.SEEN;
            promote(key, status);
        });
    }

    return visibility;
}

/**
 * Produce a simple mask of tile keys filtered by the requested visibility states.
 * Useful for fog overlays that need to target unseen/frontier tiles without
 * duplicating visibility derivation logic.
 *
 * @param {Map<string, string>} visibilityMap visibility lookup keyed by tile id.
 * @param {Array<string>} [states=[TILE_VISIBILITY.UNSEEN]] states to include in the mask.
 * @returns {Array<string>} list of tile keys matching the requested states.
 */
export function buildVisibilityMask(visibilityMap, states = [TILE_VISIBILITY.UNSEEN]) {
    if (!(visibilityMap instanceof Map)) return [];
    const allowed = new Set(states);
    return Array.from(visibilityMap.entries())
        .filter(([, state]) => allowed.has(state))
        .map(([key]) => key);
}
