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
