/**
 * SeasonalSnowfallController maps the in-game calendar to an ambience intensity
 * curve so the void swaps between summer darkness and winter snowfall. The
 * controller smooths transitions over time to avoid visual pops when months
 * advance and exposes debug hooks for forcing seasonal states.
 */

const MONTH_INTENSITY_ANCHORS = [
    1,    // Jan
    0.9,  // Feb
    0.65, // Mar
    0,    // Apr
    0,    // May
    0,    // Jun
    0,    // Jul
    0,    // Aug
    0,    // Sep
    0,    // Oct
    0.65, // Nov
    0.95  // Dec
];

const DEBUG_MODES = {
    NONE: 'none',
    WINTER: 'winter',
    SUMMER: 'summer',
    FROZEN: 'frozen'
};

function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function clampNoiseFloor(noiseFloor = 0) {
    const floor = Number.isFinite(noiseFloor) ? noiseFloor : 0;
    return Math.max(0, Math.min(0.1, floor));
}

function interpolateAnchors(calendar, noiseFloor = 0) {
    if (!calendar || !calendar.month) return noiseFloor;
    const monthIndex = ((Math.floor(calendar.month) - 1 + 12) % 12);
    const progress = clamp01((calendar.dayOfMonth - 1) / (calendar.daysPerMonth || 28));
    const current = MONTH_INTENSITY_ANCHORS[monthIndex] ?? 0;
    const next = MONTH_INTENSITY_ANCHORS[(monthIndex + 1) % 12] ?? current;
    const blended = current + (next - current) * progress;
    const clamped = clamp01(blended);
    return Math.max(clamped, noiseFloor);
}

/**
 * Compute a normalized snowfall intensity driven by the current calendar month.
 *
 * @param {object} calendar calendar snapshot from Timekeeper#getCalendar().
 * @param {object} [options]
 * @param {number} [options.noiseFloor=0] minimum ambience intensity (0..0.1) even during summer.
 * @param {boolean} [options.forceWinter=false] lock intensity to peak winter.
 * @param {boolean} [options.forceSummer=false] clamp intensity to the configured noise floor.
 * @returns {number} normalized intensity in the range [0, 1].
 */
function computeSeasonalSnowfallIntensity(calendar, options = {}) {
    const noiseFloor = clampNoiseFloor(options.noiseFloor);
    if (options.forceWinter) return 1;
    if (options.forceSummer) return noiseFloor;
    return interpolateAnchors(calendar, noiseFloor);
}

/**
 * Drive ambience strength from the calendar while keeping transitions smooth.
 */
class SeasonalSnowfallController {
    /**
     * @param {object} params
     * @param {object} params.timekeeper Timekeeper instance supplying calendar snapshots.
     * @param {number} [params.noiseFloor=0] optional ambience noise floor (0..0.1) used in warm months.
     * @param {number} [params.smoothingRate=2.6] lerp multiplier controlling how quickly the displayed intensity catches up.
     */
    constructor({ timekeeper, noiseFloor = 0, smoothingRate = 2.6 } = {}) {
        this.timekeeper = timekeeper;
        this.noiseFloor = clampNoiseFloor(noiseFloor);
        this.smoothingRate = Math.max(0.1, smoothingRate);
        this.state = {
            intensity: this.noiseFloor,
            targetIntensity: this.noiseFloor,
            debugMode: DEBUG_MODES.NONE,
            frozenIntensity: null
        };
    }

    /** Attach debug helpers to a global target (window) for quick manual overrides. */
    attachDebugControls(globalTarget = typeof window !== 'undefined' ? window : undefined) {
        if (!globalTarget) return undefined;
        const api = {
            forceWinter: () => this.setDebugMode(DEBUG_MODES.WINTER),
            forceSummer: () => this.setDebugMode(DEBUG_MODES.SUMMER),
            clearForces: () => this.setDebugMode(DEBUG_MODES.NONE),
            freeze: (value) => this.freeze(value),
            unfreeze: () => this.unfreeze(),
            setNoiseFloor: (value) => {
                this.noiseFloor = clampNoiseFloor(value);
                return this.noiseFloor;
            },
            getState: () => ({ ...this.state, noiseFloor: this.noiseFloor })
        };
        globalTarget.SeasonalSnowfallDebug = api;
        return api;
    }

    setDebugMode(mode = DEBUG_MODES.NONE) {
        if (!Object.values(DEBUG_MODES).includes(mode)) return this.state.debugMode;
        this.state.debugMode = mode;
        if (mode !== DEBUG_MODES.FROZEN) this.state.frozenIntensity = null;
        return this.state.debugMode;
    }

    freeze(value) {
        this.state.debugMode = DEBUG_MODES.FROZEN;
        if (Number.isFinite(value)) {
            this.state.frozenIntensity = clamp01(value);
        } else if (!Number.isFinite(this.state.frozenIntensity)) {
            this.state.frozenIntensity = this.state.intensity;
        }
        return this.state.frozenIntensity;
    }

    unfreeze() {
        if (this.state.debugMode !== DEBUG_MODES.FROZEN) return this.state.intensity;
        this.state.debugMode = DEBUG_MODES.NONE;
        return this.state.intensity;
    }

    resolveTargetIntensity(calendar) {
        if (this.state.debugMode === DEBUG_MODES.WINTER) return 1;
        if (this.state.debugMode === DEBUG_MODES.SUMMER) return this.noiseFloor;
        if (this.state.debugMode === DEBUG_MODES.FROZEN && Number.isFinite(this.state.frozenIntensity)) {
            return this.state.frozenIntensity;
        }
        return computeSeasonalSnowfallIntensity(calendar, { noiseFloor: this.noiseFloor });
    }

    /**
     * Step the controller forward, smoothing intensity changes and returning an
     * ambience profile suitable for the renderer.
     * @param {number} [dt=0] delta time in seconds between frames.
     * @param {object} [calendarOverride] optional calendar snapshot to avoid recomputing.
     * @returns {{intensity:number,targetIntensity:number,noiseFloor:number,driftMultiplier:number,densityMultiplier:number,scaleMultiplier:number,whiteness:number,opacityFloor:number}}
     */
    update(dt = 0, calendarOverride) {
        const calendar = calendarOverride || this.timekeeper?.getCalendar?.();
        const targetIntensity = this.resolveTargetIntensity(calendar);
        this.state.targetIntensity = targetIntensity;
        if (this.state.debugMode === DEBUG_MODES.FROZEN && Number.isFinite(this.state.frozenIntensity)) {
            this.state.intensity = this.state.frozenIntensity;
        } else {
            const factor = dt <= 0 ? 1 : Math.min(1, Math.max(0.05, dt * this.smoothingRate));
            this.state.intensity += (targetIntensity - this.state.intensity) * factor;
        }

        return this.buildProfile();
    }

    buildProfile() {
        const whiteness = 0.35 + this.state.intensity * 0.65;
        return {
            intensity: clamp01(this.state.intensity),
            targetIntensity: clamp01(this.state.targetIntensity),
            noiseFloor: this.noiseFloor,
            driftMultiplier: 0.35 + this.state.intensity * 1.5,
            densityMultiplier: 0.25 + this.state.intensity * 1.25,
            scaleMultiplier: 1 - this.state.intensity * 0.22,
            whiteness,
            opacityFloor: this.noiseFloor * 0.65,
            debugMode: this.state.debugMode
        };
    }
}

export {
    computeSeasonalSnowfallIntensity,
    SeasonalSnowfallController,
    DEBUG_MODES
};

export default SeasonalSnowfallController;
