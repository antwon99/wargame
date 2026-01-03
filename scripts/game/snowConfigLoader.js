const SNOW_MONTHS = [9, 10, 11, 0, 1, 2];
const fallbackSnowVisualConfig = {
    enabled: true,
    snowfallEnabled: true,
    minCoverage: 0,
    maxCoverage: 1,
    maxOpacity: 0.82
};
const fallbackResolveSnowVisualConfig = (snowConfig = {}) => {
    const normalized = { ...fallbackSnowVisualConfig, ...(snowConfig || {}) };
    const date = snowConfig.currentDate instanceof Date ? snowConfig.currentDate : new Date();
    const month = date.getMonth();
    const index = SNOW_MONTHS.indexOf(month);
    if (index === -1) {
        return {
            ...normalized,
            enabled: false,
            coverage: 0,
            seasonProgress: 0
        };
    }

    const daysInMonth = new Date(date.getFullYear(), month + 1, 0).getDate();
    const dayProgress = Math.max(0, Math.min(1, (date.getDate() - 1) / daysInMonth));
    const normalizedProgress = (index + dayProgress) / (SNOW_MONTHS.length - 1);
    const mirrored = normalizedProgress <= 0.5 ? normalizedProgress * 2 : (1 - normalizedProgress) * 2;
    const seasonProgress = Math.max(0, Math.min(1, mirrored));
    const enabled = normalized.enabled !== false && normalized.snowfallEnabled !== false;
    const coverage = enabled
        ? normalized.minCoverage + (normalized.maxCoverage - normalized.minCoverage) * seasonProgress
        : 0;

    return {
        ...normalized,
        enabled: enabled && index !== -1,
        coverage,
        seasonProgress
    };
};
let cachedSnowVisualConfig = fallbackSnowVisualConfig;
let cachedSnowConfigResolver = fallbackResolveSnowVisualConfig;
let snowConfigPromise = null;
const ensureSnowVisualConfigModule = () => {
    if (!snowConfigPromise) {
        snowConfigPromise = import('../snowVisualConfig.js')
            .then((module) => {
                cachedSnowVisualConfig = module.SNOW_VISUAL_CONFIG || fallbackSnowVisualConfig;
                cachedSnowConfigResolver = module.resolveSnowVisualConfig || fallbackResolveSnowVisualConfig;
            })
            .catch(() => {
                cachedSnowVisualConfig = cachedSnowVisualConfig || fallbackSnowVisualConfig;
                cachedSnowConfigResolver = cachedSnowConfigResolver || fallbackResolveSnowVisualConfig;
            });
    }

    return snowConfigPromise;
};

/**
 * Fetch the cached snow visual defaults, initiating lazy load if needed.
 * @returns {Object} snow visual config defaults.
 */
const getSnowVisualConfig = () => {
    ensureSnowVisualConfigModule();
    return cachedSnowVisualConfig;
};

/**
 * Fetch the cached snow visual resolver, initiating lazy load if needed.
 * @returns {Function} snow visual config resolver.
 */
const getSnowVisualConfigResolver = () => {
    ensureSnowVisualConfigModule();
    return cachedSnowConfigResolver;
};

export { getSnowVisualConfig, getSnowVisualConfigResolver };
