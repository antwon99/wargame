/**
 * Snow visual parameters that drive the seasonal overlay.
 * The overlay paints a rising white gradient from the bottom of the viewport
 * during winter months (October–March) to emphasize cold weather without
 * hiding map readability.
 */
const SNOW_MONTHS = [9, 10, 11, 0, 1, 2];

const SNOW_VISUAL_CONFIG = {
    enabled: true,
    /** Toggle the seasonal gradient overlay. */
    snowfallEnabled: true,
    /**
     * Minimum coverage (percentage of the viewport height) when snow season
     * begins. Coverage rises toward the peak month and fades as winter ends.
     */
    minCoverage: 0.18,
    /** Maximum coverage at peak winter. */
    maxCoverage: 0.8,
    /**
     * Opacity applied at the base of the gradient. The top of the overlay
     * always fades to transparent to preserve legibility.
     */
    maxOpacity: 0.82
};

/**
 * Resolve whether snow should appear for the provided date.
 * @param {Date} [currentDate=new Date()] optional date override for tests.
 * @returns {{inSeason: boolean, progress: number}} snow season metadata.
 */
function resolveSnowSeason(currentDate = new Date()) {
    const month = currentDate.getMonth();
    const index = SNOW_MONTHS.indexOf(month);
    if (index === -1) return { inSeason: false, progress: 0 };
    const normalized = index / (SNOW_MONTHS.length - 1);
    // Ramp up toward January (midpoint) and back down by March.
    const mirrored = normalized <= 0.5 ? normalized * 2 : (1 - normalized) * 2;
    return { inSeason: true, progress: Math.max(0, Math.min(1, mirrored)) };
}

/**
 * Combine caller overrides with defaults and compute the snow coverage for the
 * active date. Coverage determines how tall the gradient appears on screen.
 * @param {Object} [snowConfig] optional overrides.
 * @param {Date} [snowConfig.currentDate] optional date used instead of `new Date()`.
 * @returns {Object} normalized snow visual configuration.
 */
function resolveSnowVisualConfig(snowConfig = {}) {
    const normalized = { ...SNOW_VISUAL_CONFIG, ...(snowConfig || {}) };
    const date = snowConfig.currentDate instanceof Date ? snowConfig.currentDate : new Date();
    const { inSeason, progress } = resolveSnowSeason(date);
    const enabled = normalized.enabled !== false && normalized.snowfallEnabled !== false && inSeason;
    const coverage = enabled
        ? normalized.minCoverage + (normalized.maxCoverage - normalized.minCoverage) * progress
        : 0;
    return {
        ...normalized,
        enabled,
        coverage,
        seasonProgress: progress
    };
}

export { SNOW_MONTHS, SNOW_VISUAL_CONFIG, resolveSnowSeason, resolveSnowVisualConfig };
