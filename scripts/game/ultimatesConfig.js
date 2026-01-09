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
 * Upgrade economy tuning for ultimate purchases.
 * Base cost is the gold price of upgrading from level 1 → 2.
 */
export const ULTIMATE_UPGRADE_CONFIG = Object.freeze({
    rush: {
        id: 'rush',
        baseCost: 220,
        costMultiplier: 1.6,
        maxLevel: 3
    },
    manpower: {
        id: 'manpower',
        baseCost: 240,
        costMultiplier: 1.6,
        maxLevel: 3
    },
    gold: {
        id: 'gold',
        baseCost: 260,
        costMultiplier: 1.6,
        maxLevel: 3
    }
});

/**
 * Default ultimate selection used when a saved choice is missing or invalid.
 */
export const DEFAULT_ULTIMATE_SELECTION = 'rush';

/**
 * Resolve a valid ultimate selection id based on the configured ultimate list.
 * Ensures callers always receive a supported id for UI and combat availability.
 * @param {string|null|undefined} candidate ultimate identifier to validate.
 * @returns {string} supported ultimate id.
 */
export function resolveUltimateSelection(candidate) {
    const knownIds = Object.keys(ULTIMATE_CONFIG);
    if (knownIds.length === 0) return DEFAULT_ULTIMATE_SELECTION;
    if (typeof candidate === 'string' && knownIds.includes(candidate)) return candidate;
    if (knownIds.includes(DEFAULT_ULTIMATE_SELECTION)) return DEFAULT_ULTIMATE_SELECTION;
    return knownIds[0];
}

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
 * Read the maximum upgrade level allowed for an ultimate.
 * @param {string} ultimateId unique ultimate identifier.
 * @returns {number} max upgrade level allowed for the ultimate.
 */
export function getUltimateMaxLevel(ultimateId) {
    const config = ULTIMATE_UPGRADE_CONFIG[ultimateId];
    return Number.isFinite(config?.maxLevel) ? Math.max(1, config.maxLevel) : 1;
}

/**
 * Compute the gold cost required to purchase the next ultimate upgrade level.
 * Returns null when the ultimate has reached its maximum level.
 * @param {string} ultimateId unique ultimate identifier.
 * @param {number} currentLevel current ultimate level (1-based).
 * @returns {number|null} gold cost for the next upgrade or null if maxed.
 */
export function getUltimateUpgradeCost(ultimateId, currentLevel) {
    const config = ULTIMATE_UPGRADE_CONFIG[ultimateId];
    if (!config) return null;
    const safeLevel = Number.isFinite(currentLevel) ? Math.max(1, Math.floor(currentLevel)) : 1;
    const maxLevel = getUltimateMaxLevel(ultimateId);
    if (safeLevel >= maxLevel) return null;
    const exponent = Math.max(0, safeLevel - 1);
    const scaled = config.baseCost * Math.pow(config.costMultiplier, exponent);
    return Math.floor(scaled);
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
