/**
 * Resolve the current enemy level from wars-won progress so the campaign
 * always starts at level 1, even before the first victory.
 * Falls back to the legacy difficulty value when wars-won is missing.
 * @param {object} game live game singleton with stats/difficulty metadata.
 * @returns {number} normalized enemy level for UI and scaling.
 */
export function resolveEnemyLevel(game) {
    const warsWonValue = Number.isFinite(game?.stats?.warsWon)
        ? game.stats.warsWon
        : (Number.isFinite(game?.difficulty) ? game.difficulty : 0);
    const normalizedWins = Math.max(0, Math.floor(warsWonValue));
    return Math.max(1, normalizedWins + 1);
}
