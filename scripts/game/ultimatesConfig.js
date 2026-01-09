/**
 * Scaling tables for combat ultimates. Charge delays are expressed in milliseconds
 * and tuned to land between 15–30 seconds across upgrade levels. Each ultimate is
 * intended for a single activation per battle; level upgrades adjust potency or
 * duration without allowing repeat uses.
 */
export const ULTIMATE_CONFIG = Object.freeze({
    rush: {
        id: 'rush',
        label: 'Rush',
        chargeDelayMs: [15000, 22000, 30000],
        durationMs: [6000, 8000, 10000],
        speedMultiplier: [1.25, 1.4, 1.6]
    },
    manpower: {
        id: 'manpower',
        label: 'Manpower',
        chargeDelayMs: [18000, 24000, 30000],
        durationMs: [8000, 10000, 12000],
        spawnRateMultiplier: [0.8, 0.7, 0.6],
        doubleSpawnChance: [0.5, 0.5, 0.5]
    },
    gold: {
        id: 'gold',
        label: 'Gold',
        chargeDelayMs: [15000, 20000, 25000],
        unitCullPercent: [0.25, 0.35, 0.45],
        goldPerUnit: [6, 8, 12]
    }
});

/**
 * Resolve a numeric value from a per-level tuning table, clamping to valid bounds.
 * @param {number[]} table array of values indexed by level - 1.
 * @param {number} level upgrade level to read (1-based).
 * @returns {number} tuned value for the requested level.
 */
export function resolveUltimateLevelValue(table, level) {
    const safeTable = Array.isArray(table) ? table : [];
    const safeLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
    if (safeTable.length === 0) return 0;
    const index = Math.min(safeTable.length - 1, safeLevel - 1);
    return safeTable[index];
}

/**
 * Read the configured charge delay for a given ultimate upgrade level.
 * @param {string} ultimateId unique ultimate identifier.
 * @param {number} level current upgrade level (1-based).
 * @returns {number} charge delay in milliseconds.
 */
export function getUltimateChargeDelayMs(ultimateId, level) {
    const config = ULTIMATE_CONFIG[ultimateId];
    return resolveUltimateLevelValue(config?.chargeDelayMs, level);
}

/**
 * Read the configured duration for a given ultimate upgrade level.
 * @param {string} ultimateId unique ultimate identifier.
 * @param {number} level current upgrade level (1-based).
 * @returns {number} effect duration in milliseconds.
 */
export function getUltimateDurationMs(ultimateId, level) {
    const config = ULTIMATE_CONFIG[ultimateId];
    return resolveUltimateLevelValue(config?.durationMs, level);
}

/**
 * Provide the baseline upgrade levels for newly created combat state.
 * Keep these aligned with upgrade UI defaults so battles always boot with
 * valid per-ultimate metadata.
 */
export const DEFAULT_ULTIMATE_LEVELS = Object.freeze({
    rush: 1,
    manpower: 1,
    gold: 1
});
