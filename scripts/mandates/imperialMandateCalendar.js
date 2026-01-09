/**
 * Imperial mandate calendar utilities.
 *
 * Converts between calendar units (days/weeks/months) and ticks, formats
 * player-facing labels, and reports deadline deltas without requiring the
 * mandate state machine. The helpers take game state and current tick values
 * as parameters so they can be tested in isolation and reused by UI overlays
 * without coupling to global mandate state.
 */
/**
 * Build the imperial mandate calendar API for shared cadence utilities.
 * @returns {Object} imperial mandate calendar helpers.
 */
function createImperialMandateCalendar() {
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DEFAULT_TIME_CONFIG = { daysPerWeek: 7, weeksPerMonth: 4 };

    /**
     * Resolve the active timekeeper configuration for mandate pacing.
     * @param {object} gameState live game reference that may contain a timekeeper.
     * @param {object} [defaults] optional default cadence when the game has none.
     * @returns {{ daysPerWeek: number, weeksPerMonth: number }} sanitized cadence.
     */
    function getTimeConfig(gameState, defaults = DEFAULT_TIME_CONFIG) {
        const tk = gameState?.timekeeper;
        return {
            daysPerWeek: Number.isFinite(tk?.daysPerWeek) ? tk.daysPerWeek : defaults.daysPerWeek,
            weeksPerMonth: Number.isFinite(tk?.weeksPerMonth)
                ? tk.weeksPerMonth
                : defaults.weeksPerMonth
        };
    }

    /**
     * Map a month number to a human-readable label that includes the year.
     * @param {number} monthNumber 1-indexed month count.
     * @param {Array<string>} [monthNames] optional month name lookup.
     * @returns {{ label: string, name: string, year: number }}
     */
    function getMonthLabel(monthNumber, monthNames = MONTH_NAMES) {
        const safeMonth = Math.max(1, Number.isFinite(monthNumber) ? monthNumber : 1);
        const monthIndex = safeMonth - 1;
        const year = Math.floor(monthIndex / monthNames.length) + 1;
        const name = monthNames[monthIndex % monthNames.length];
        return { label: `${name} Y${year}`, name, year };
    }

    /**
     * Convert calendar units to ticks using the provided cadence.
     * @param {object} units calendar units (days/weeks/months).
     * @param {object} gameState live game reference for cadence lookup.
     * @param {object} [defaults] optional default cadence.
     * @returns {number} non-negative tick count.
     */
    function convertToTicks(units = {}, gameState, defaults = DEFAULT_TIME_CONFIG) {
        if (!units || typeof units !== 'object') return 0;
        const config = getTimeConfig(gameState, defaults);
        const monthsToDays = (units.months || 0) * config.weeksPerMonth * config.daysPerWeek;
        const weeksToDays = (units.weeks || 0) * config.daysPerWeek;
        return Math.max(0, (units.days || 0) + weeksToDays + monthsToDays);
    }

    /**
     * Translate a tick index into calendar metadata for UI overlays.
     * @param {number} tick zero-based tick index.
     * @param {object} gameState live game reference for cadence lookup.
     * @param {object} [defaults] optional default cadence.
     * @param {Array<string>} [monthNames] optional month name lookup.
     * @returns {{ dayOfWeek: number, weekOfMonth: number, month: number, day: number, dayOfMonth: number, daysPerMonth: number, monthName: string, year: number }}
     */
    function getCalendarForTick(tick, gameState, defaults = DEFAULT_TIME_CONFIG, monthNames = MONTH_NAMES) {
        const config = getTimeConfig(gameState, defaults);
        const safeTicks = Math.max(0, Number.isFinite(tick) ? tick : 0);
        const day = safeTicks + 1;
        const week = Math.floor((day - 1) / config.daysPerWeek);
        const month = Math.floor(week / config.weeksPerMonth) + 1;
        const weekOfMonth = (week % config.weeksPerMonth) + 1;
        const dayOfWeek = ((day - 1) % config.daysPerWeek) + 1;
        const daysPerMonth = config.daysPerWeek * config.weeksPerMonth;
        const dayOfMonth = (weekOfMonth - 1) * config.daysPerWeek + dayOfWeek;
        const monthMeta = getMonthLabel(month, monthNames);
        return {
            dayOfWeek,
            weekOfMonth,
            month,
            day,
            dayOfMonth,
            daysPerMonth,
            monthName: monthMeta.name,
            year: monthMeta.year
        };
    }

    /**
     * Render a succinct calendar label for a tick using the configured cadence.
     * @param {number} tick zero-based tick index.
     * @param {object} [gameState] optional game reference for cadence lookup.
     * @param {object} [defaults] optional default cadence.
     * @param {Array<string>} [monthNames] optional month name lookup.
     * @returns {string} formatted month/week/day label.
     */
    function formatCalendarLabel(tick, gameState, defaults = DEFAULT_TIME_CONFIG, monthNames = MONTH_NAMES) {
        const cal = getCalendarForTick(tick, gameState, defaults, monthNames);
        const config = getTimeConfig(gameState, defaults);
        const label = getMonthLabel(cal.month, monthNames).label;
        return `M: ${label} | W: ${cal.weekOfMonth}/${config.weeksPerMonth} | D: ${cal.dayOfMonth}/${cal.daysPerMonth}`;
    }

    /**
     * Convert an absolute mandate deadline into calendar text and remaining days.
     * @param {number|null|undefined} deadlineTick tick index when the mandate expires.
     * @param {number} currentTick active mandate tick counter.
     * @param {object} [gameState] optional game reference for cadence lookup.
     * @param {object} [defaults] optional default cadence.
     * @param {Array<string>} [monthNames] optional month name lookup.
     * @returns {{ label: string, remainingDays: number|null }}
     */
    function describeDeadlineTick(deadlineTick, currentTick, gameState, defaults = DEFAULT_TIME_CONFIG, monthNames = MONTH_NAMES) {
        if (!Number.isFinite(deadlineTick)) {
            return { label: 'No fixed deadline', remainingDays: null };
        }

        const normalizedTick = Math.max(0, deadlineTick);
        const label = formatCalendarLabel(Math.max(0, normalizedTick - 1), gameState, defaults, monthNames);
        const remainingDays = normalizedTick - Math.max(0, Number.isFinite(currentTick) ? currentTick : 0);
        return { label, remainingDays };
    }

    /**
     * Calculate the minimum spacing between mandate issuances using the cadence helpers.
     * @param {object} [gameState] optional game reference for cadence lookup.
     * @param {object} [defaults] optional default cadence.
     * @returns {number} minimum ticks between issuances.
     */
    function getMinimumMandateSpacing(gameState, defaults = DEFAULT_TIME_CONFIG) {
        return convertToTicks({ weeks: 1, days: 2 }, gameState, defaults);
    }

    /**
     * Convert the earliestIssue config for a mandate entry into ticks.
     * @param {object} entry mandate registry entry.
     * @param {object} [gameState] optional game reference for cadence lookup.
     * @param {object} [defaults] optional default cadence.
     * @returns {number} earliest issuance tick.
     */
    function getEarliestIssueTick(entry, gameState, defaults = DEFAULT_TIME_CONFIG) {
        if (!entry?.definition?.earliestIssue) return 0;
        return convertToTicks(entry.definition.earliestIssue, gameState, defaults);
    }

    const api = {
        DEFAULT_TIME_CONFIG,
        MONTH_NAMES,
        getTimeConfig,
        getMonthLabel,
        convertToTicks,
        getCalendarForTick,
        formatCalendarLabel,
        describeDeadlineTick,
        getMinimumMandateSpacing,
        getEarliestIssueTick
    };

    return api;
}

const ImperialMandateCalendar = createImperialMandateCalendar();

/**
 * Register the mandate calendar helpers on the provided global scope.
 * @param {Window|Object} [target] global object to attach ImperialMandateCalendar to.
 * @returns {Object} imperial mandate calendar API.
 */
function initImperialMandateCalendar(target = typeof window !== 'undefined' ? window : globalThis) {
    if (target) {
        target.ImperialMandateCalendar = ImperialMandateCalendar;
    }
    return ImperialMandateCalendar;
}

ImperialMandateCalendar.initImperialMandateCalendar = initImperialMandateCalendar;
ImperialMandateCalendar.createImperialMandateCalendar = createImperialMandateCalendar;

export { initImperialMandateCalendar, createImperialMandateCalendar };
export default ImperialMandateCalendar;

