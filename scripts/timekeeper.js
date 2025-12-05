/**
 * Calendar helper that converts overworld ticks into a readable in-game date.
 * The module is intentionally small so it can run in browsers and Node tests.
 */
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class Timekeeper {
    /**
     * @param {object} [config] optional configuration values.
     * @param {number} [config.daysPerWeek=7] how many ticks make up a week.
     * @param {number} [config.weeksPerMonth=4] how many weeks make up a month.
     * @param {number} [config.startTick=0] initial tick counter (0 = Day 1).
     */
    constructor(config = {}) {
        this.daysPerWeek = Number.isFinite(config.daysPerWeek) ? config.daysPerWeek : 7;
        this.weeksPerMonth = Number.isFinite(config.weeksPerMonth) ? config.weeksPerMonth : 4;
        this.ticks = Math.max(0, config.startTick || 0);
        this.listeners = new Set();
    }

    /**
     * Register a listener that fires whenever the calendar advances.
     * @param {(payload: object) => void} handler callback receiving the new calendar snapshot.
     * @returns {() => void} unsubscribe function to detach the listener.
     */
    onChange(handler) {
        if (typeof handler !== 'function') return () => {};
        this.listeners.add(handler);
        return () => this.listeners.delete(handler);
    }

    /**
     * Force the tick counter to a specific value and broadcast the new calendar.
     * @param {number} ticks absolute tick value.
     */
    reset(ticks = 0) {
        this.ticks = Math.max(0, Number.isFinite(ticks) ? ticks : 0);
        this.emitChange();
    }

    /**
     * Advance the calendar by the desired number of ticks (days).
     * @param {number} ticks number of ticks to add (defaults to one day).
     * @returns {object} updated calendar snapshot after advancing.
     */
    advance(ticks = 1) {
        const delta = Number.isFinite(ticks) ? ticks : 0;
        if (delta <= 0) return this.getCalendar();
        this.ticks += delta;
        this.emitChange();
        return this.getCalendar();
    }

    /**
     * Convert a tick counter into month/week/day components.
     * @param {number} [ticks=this.ticks] tick value to convert.
     * @returns {{ dayOfWeek: number, weekOfMonth: number, month: number, day: number, dayOfMonth: number, daysPerMonth: number, monthName: string, year: number }}
     */
    getCalendar(ticks = this.ticks) {
        const safeTicks = Math.max(0, Number.isFinite(ticks) ? ticks : 0);
        const day = safeTicks + 1;
        const week = Math.floor((day - 1) / this.daysPerWeek);
        const month = Math.floor(week / this.weeksPerMonth) + 1;
        const weekOfMonth = (week % this.weeksPerMonth) + 1;
        const dayOfWeek = ((day - 1) % this.daysPerWeek) + 1;
        const daysPerMonth = this.daysPerWeek * this.weeksPerMonth;
        const dayOfMonth = (weekOfMonth - 1) * this.daysPerWeek + dayOfWeek;
        const monthIndex = month - 1;
        const year = Math.floor(monthIndex / 12) + 1;
        const monthName = MONTH_NAMES[monthIndex % MONTH_NAMES.length];
        return { dayOfWeek, weekOfMonth, month, day, dayOfMonth, daysPerMonth, monthName, year };
    }

    /**
     * Format a friendly HUD-ready calendar string (Month > Week > Day).
     * @param {number} [ticks=this.ticks] optional tick override.
     * @returns {string} formatted calendar string.
     */
    formatCalendar(ticks = this.ticks) {
        const cal = this.getCalendar(ticks);
        const label = `${cal.monthName} Y${cal.year}`;
        return `M: ${label} | W: ${cal.weekOfMonth}/${this.weeksPerMonth} | D: ${cal.dayOfMonth}/${cal.daysPerMonth}`;
    }

    /** Notify listeners and DOM observers about a calendar change. */
    emitChange() {
        const payload = { ticks: this.ticks, calendar: this.getCalendar() };
        this.listeners.forEach((fn) => fn(payload));
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            const evt = new CustomEvent('time:changed', { detail: payload });
            window.dispatchEvent(evt);
        }
    }
}

if (typeof window !== 'undefined') {
    window.Timekeeper = Timekeeper;
}

export default Timekeeper;
