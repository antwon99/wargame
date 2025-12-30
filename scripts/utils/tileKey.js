/**
 * Build a stable string key for an overworld tile.
 * @param {object|null} tile tile payload containing a hex coordinate or string key.
 * @returns {string|null} string key when available.
 */
function getTileKey(tile) {
    if (!tile) return null;
    if (tile.hex && typeof tile.hex.toString === 'function') return tile.hex.toString();
    if (typeof tile.toString === 'function') return tile.toString();
    return null;
}

export { getTileKey };

if (typeof module !== 'undefined') {
    module.exports = { getTileKey };
}
