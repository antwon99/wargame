/**
 * Calendar helpers for imperial mandates.
 *
 * Converts user-facing calendar units into ticks and provides formatted labels
 * aligned with the game's timekeeper configuration. Shared between the
 * mandate engine and UI overlays so deadlines stay consistent everywhere.
 */
(function (global) {
    const DEFAULT_TIME_CONFIG = { daysPerWeek: 7, weeksPerMonth: 4 };
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    /**
     * Resolve a stable time configuration even when the live game state is missing.
     * @param {object} [gameState] optional live game state with a timekeeper field.
     * @returns {{ daysPerWeek: number, weeksPerMonth: number }} sanitized pacing values.
     */
    function getTimeConfig(gameState) {
        const tk = gameState?.timekeeper;
        return {
            daysPerWeek: Number.isFinite(tk?.daysPerWeek) ? tk.daysPerWeek : DEFAULT_TIME_CONFIG.daysPerWeek,
            weeksPerMonth: Number.isFinite(tk?.weeksPerMonth)
                ? tk.weeksPerMonth
                : DEFAULT_TIME_CONFIG.weeksPerMonth
        };
    }

    /**
     * Map an ordinal month to a friendly label and tracked year for long campaigns.
     * @param {number} monthNumber 1-based month count.
     * @returns {{ label: string, name: string, year: number }} month metadata for HUD rendering.
     */
    function getMonthLabel(monthNumber) {
        const safeMonth = Math.max(1, Number.isFinite(monthNumber) ? monthNumber : 1);
        const monthIndex = safeMonth - 1;
        const year = Math.floor(monthIndex / 12) + 1;
        const name = MONTH_NAMES[monthIndex % MONTH_NAMES.length];
        return { label: `${name} Y${year}`, name, year };
    }

    /**
     * Convert structured calendar units into ticks using the timekeeper pacing.
     * @param {{ months?: number, weeks?: number, days?: number }} units user-facing calendar units.
     * @param {object} [gameState] optional game state with a timekeeper reference.
     * @returns {number} non-negative tick count.
     */
    function convertToTicks(units = {}, gameState) {
        if (!units || typeof units !== 'object') return 0;
        const config = getTimeConfig(gameState);
        const monthsToDays = (units.months || 0) * config.weeksPerMonth * config.daysPerWeek;
        const weeksToDays = (units.weeks || 0) * config.daysPerWeek;
        return Math.max(0, (units.days || 0) + weeksToDays + monthsToDays);
    }

    /**
     * Translate a tick counter into calendar metadata.
     * @param {number} tick zero-based tick index.
     * @param {object} [gameState] optional game state for pacing values.
     * @returns {{ dayOfWeek: number, weekOfMonth: number, month: number, day: number, dayOfMonth: number, daysPerMonth: number, monthName: string, year: number }}
     */
    function getCalendarForTick(tick, gameState) {
        const config = getTimeConfig(gameState);
        const safeTicks = Math.max(0, Number.isFinite(tick) ? tick : 0);
        const day = safeTicks + 1;
        const week = Math.floor((day - 1) / config.daysPerWeek);
        const month = Math.floor(week / config.weeksPerMonth) + 1;
        const weekOfMonth = (week % config.weeksPerMonth) + 1;
        const dayOfWeek = ((day - 1) % config.daysPerWeek) + 1;
        const daysPerMonth = config.daysPerWeek * config.weeksPerMonth;
        const dayOfMonth = (weekOfMonth - 1) * config.daysPerWeek + dayOfWeek;
        const monthMeta = getMonthLabel(month);
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
     * Render a concise calendar string for mandate overlays.
     * @param {number} tick zero-based tick index.
     * @param {object} [gameState] optional game state for pacing values.
     * @returns {string} formatted calendar label (month, week, and day progress).
     */
    function formatCalendarLabel(tick, gameState) {
        const cal = getCalendarForTick(tick, gameState);
        const config = getTimeConfig(gameState);
        const label = getMonthLabel(cal.month).label;
        return `M: ${label} | W: ${cal.weekOfMonth}/${config.weeksPerMonth} | D: ${cal.dayOfMonth}/${cal.daysPerMonth}`;
    }

    /**
     * Convert a mandate deadline tick into human-readable text and a remaining delta.
     * @param {number|null|undefined} deadlineTick tick on which the mandate expires.
     * @param {{ currentTick?: number, gameState?: object, fallbackGameState?: object }} [options] contextual information for pacing.
     * @returns {{ label: string, remainingDays: number|null }} deadline description.
     */
    function describeDeadlineTick(deadlineTick, { currentTick = 0, gameState, fallbackGameState } = {}) {
        if (!Number.isFinite(deadlineTick)) {
            return { label: 'No fixed deadline', remainingDays: null };
        }

        const normalizedTick = Math.max(0, deadlineTick);
        const ctx = gameState || fallbackGameState;
        const label = formatCalendarLabel(Math.max(0, normalizedTick - 1), ctx);
        const remainingDays = normalizedTick - Math.max(0, Number.isFinite(currentTick) ? currentTick : 0);
        return { label, remainingDays };
    }

    const api = {
        DEFAULT_TIME_CONFIG,
        MONTH_NAMES,
        getTimeConfig,
        getMonthLabel,
        convertToTicks,
        getCalendarForTick,
        formatCalendarLabel,
        describeDeadlineTick
    };

    global.MandateCalendar = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
