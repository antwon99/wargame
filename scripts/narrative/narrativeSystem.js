import { NARRATIVE_TEMPLATES, NARRATIVE_VOICES } from './narrativeTemplates.js';

const MAX_BEATS_PER_WEEK = {
    low: 1,
    medium: 1,
    high: 2,
    critical: 2
};

const DEFAULT_SEVERITY = 'medium';

/**
 * Create a seeded pseudo-random generator using an LCG for deterministic selection.
 * @param {string|number} seed stable seed input.
 * @returns {{ next: () => number }} RNG that returns a float in [0,1).
 */
function createSeededRng(seed) {
    let state = typeof seed === 'number' ? seed : hashStringToSeed(String(seed));
    state = state >>> 0;
    return {
        next: () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        }
    };
}

/**
 * Normalize a provided RNG into the expected interface, if available.
 * @param {object} rng possible RNG implementation.
 * @returns {{ next: () => number }|null} normalized RNG or null.
 */
function normalizeRng(rng) {
    if (!rng) return null;
    if (typeof rng.next === 'function') return rng;
    if (typeof rng.random === 'function') {
        return { next: () => rng.random() };
    }
    return null;
}

/**
 * Convert a string into a stable 32-bit seed.
 * @param {string} value seed input.
 * @returns {number} unsigned 32-bit hash.
 */
function hashStringToSeed(value) {
    let hash = 2166136261;
    for (let idx = 0; idx < value.length; idx += 1) {
        hash ^= value.charCodeAt(idx);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

/**
 * Build a week index for cooldown tracking using the timekeeper calendar.
 * @param {object} timekeeper timekeeper instance with calendar data.
 * @returns {number} stable week identifier across months and years.
 */
function getWeekIndex(timekeeper) {
    if (!timekeeper || typeof timekeeper.getCalendar !== 'function') return 0;
    const calendar = timekeeper.getCalendar(timekeeper.ticks);
    const weeksPerMonth = Number.isFinite(timekeeper.weeksPerMonth) ? timekeeper.weeksPerMonth : 4;
    const totalWeeksBeforeMonth = (calendar.month - 1) * weeksPerMonth;
    const totalWeeksBeforeYear = (calendar.year - 1) * 12 * weeksPerMonth;
    return totalWeeksBeforeYear + totalWeeksBeforeMonth + (calendar.weekOfMonth - 1);
}

/**
 * Pick a deterministic element from an array using the provided RNG.
 * @param {Array} options list of candidates.
 * @param {{ next: () => number }} rng random generator.
 * @returns {*} selected entry or null when empty.
 */
function pickRandom(options, rng) {
    if (!Array.isArray(options) || options.length === 0) return null;
    const index = Math.floor(rng.next() * options.length);
    return options[Math.min(Math.max(index, 0), options.length - 1)];
}

/**
 * Fill narrative tokens with the payload + calendar context.
 * @param {string} template line template containing placeholders.
 * @param {object} context token map.
 * @returns {string|null} filled string or null on failure.
 */
function fillTemplate(template, context) {
    try {
        return template.replace(/\{(\w+)\}/g, (match, key) => {
            if (Object.prototype.hasOwnProperty.call(context, key)) {
                const value = context[key];
                return value === null || value === undefined ? '' : String(value);
            }
            return '';
        });
    } catch (error) {
        return null;
    }
}

/**
 * Construct token values from calendar and payload data.
 * @param {object} payload event payload.
 * @param {object} calendar timekeeper calendar output.
 * @returns {object} token map for template replacement.
 */
function buildTokenContext(payload, calendar) {
    const safeCalendar = calendar || {};
    return {
        month: safeCalendar.monthName,
        week: safeCalendar.weekOfMonth,
        day: safeCalendar.day,
        dayOfWeek: safeCalendar.dayOfWeek,
        dayOfMonth: safeCalendar.dayOfMonth,
        year: safeCalendar.year,
        favor: payload?.favor,
        goldDelta: payload?.goldDelta,
        woodDelta: payload?.woodDelta,
        count: payload?.count
    };
}

/**
 * Create a narrative system that chooses templated story beats and enqueues notifications.
 * @param {object} options initialization options.
 * @param {object} [options.rng] optional RNG with next() or random() for selection.
 * @param {string|number} [options.rngSeed] optional seed for deterministic narrative selection.
 * @param {object} options.timekeeper timekeeper instance with calendar/tick data.
 * @param {object} options.notificationManager notification manager with enqueue().
 * @param {object} [options.taskPanel] optional task panel hook for extra logging.
 * @returns {{ emit: Function, serializeState: Function, hydrateState: Function }} narrative system API.
 */
export function createNarrativeSystem({ rng, rngSeed = null, timekeeper, notificationManager, taskPanel } = {}) {
    const state = {
        weeklyCounts: {},
        lastBeatTicks: {},
        rngSeed
    };

    const providedRng = normalizeRng(rng);
    let baseRng = providedRng;
    if (!baseRng && rngSeed !== null && rngSeed !== undefined) {
        baseRng = createSeededRng(rngSeed);
    }

    /**
     * Emit a narrative beat for the given event type and payload.
     * @param {string} eventType narrative event type (e.g., economy, favor).
     * @param {object} payload payload containing severity, tokens, and optional seed.
     * @returns {object|null} notification payload or null when gated/invalid.
     */
    function emit(eventType, payload = {}) {
        if (!eventType) return null;
        const severity = payload.severity || DEFAULT_SEVERITY;
        const templates = NARRATIVE_TEMPLATES?.[eventType]?.[severity] || [];
        if (!templates.length) return null;

        const currentTick = Number.isFinite(timekeeper?.ticks) ? timekeeper.ticks : 0;
        const calendar = typeof timekeeper?.getCalendar === 'function'
            ? timekeeper.getCalendar(currentTick)
            : null;
        const weekIndex = getWeekIndex(timekeeper);
        const category = payload.category || eventType;

        const voiceKey = payload.voice && NARRATIVE_VOICES[payload.voice] ? payload.voice : null;
        const seed = payload.seed ?? `${currentTick}|${eventType}|${severity}`;
        const seededRng = payload.seed !== undefined && payload.seed !== null
            ? createSeededRng(payload.seed)
            : createSeededRng(seed);
        const rngForSelection = payload.seed !== undefined && payload.seed !== null
            ? seededRng
            : (baseRng || seededRng);

        const availableVoices = Array.from(new Set(templates.map((entry) => entry.voice))).filter(Boolean);
        const selectedVoice = voiceKey || pickRandom(availableVoices, rngForSelection);
        const voiceProfile = selectedVoice ? NARRATIVE_VOICES[selectedVoice] : null;
        if (!selectedVoice || !voiceProfile) return null;

        const weekKey = String(weekIndex);
        const categoryKey = `${selectedVoice}:${category}`;
        const weekly = state.weeklyCounts[weekKey] || {};
        const weeklyCount = weekly[categoryKey] || 0;
        const maxBeats = Number.isFinite(payload.maxBeatsPerWeek)
            ? payload.maxBeatsPerWeek
            : (MAX_BEATS_PER_WEEK[severity] ?? 1);
        if (weeklyCount >= maxBeats) return null;

        if (maxBeats <= 1 && state.lastBeatTicks[categoryKey] === currentTick) return null;

        const voiceTemplates = templates.filter((entry) => entry.voice === selectedVoice);
        const selectedTemplate = pickRandom(voiceTemplates.length ? voiceTemplates : templates, rngForSelection);
        if (!selectedTemplate || !Array.isArray(selectedTemplate.lines)) return null;

        const tokens = buildTokenContext(payload, calendar);
        const filledLines = selectedTemplate.lines.map((line) => fillTemplate(line, tokens));
        if (filledLines.some((line) => line === null)) return null;

        const notification = {
            title: selectedTemplate.title || voiceProfile.title || voiceProfile.name,
            lines: filledLines,
            tone: selectedTemplate.tone || voiceProfile.tone,
            voice: selectedVoice,
            category,
            severity
        };

        weekly[categoryKey] = weeklyCount + 1;
        state.weeklyCounts[weekKey] = weekly;
        state.lastBeatTicks[categoryKey] = currentTick;

        if (typeof notificationManager?.enqueue === 'function') {
            notificationManager.enqueue(notification);
        }
        if (typeof taskPanel?.enqueueNarrative === 'function') {
            taskPanel.enqueueNarrative(notification);
        }

        return notification;
    }

    /**
     * Serialize cooldowns and last-beat state for persistence.
     * @returns {{ weeklyCounts: object, lastBeatTicks: object, rngSeed?: string|number }} snapshot data.
     */
    function serializeState() {
        const snapshot = {
            weeklyCounts: JSON.parse(JSON.stringify(state.weeklyCounts || {})),
            lastBeatTicks: { ...state.lastBeatTicks }
        };
        if (state.rngSeed !== null && state.rngSeed !== undefined) {
            snapshot.rngSeed = state.rngSeed;
        }
        return snapshot;
    }

    /**
     * Restore cooldowns and last-beat state from persistence.
     * @param {object|null} snapshot persisted narrative state.
     */
    function hydrateState(snapshot) {
        if (!snapshot) return;
        state.weeklyCounts = snapshot.weeklyCounts && typeof snapshot.weeklyCounts === 'object'
            ? { ...snapshot.weeklyCounts }
            : {};
        state.lastBeatTicks = snapshot.lastBeatTicks && typeof snapshot.lastBeatTicks === 'object'
            ? { ...snapshot.lastBeatTicks }
            : {};
        if (snapshot.rngSeed !== undefined && snapshot.rngSeed !== null) {
            state.rngSeed = snapshot.rngSeed;
            if (!providedRng) {
                baseRng = createSeededRng(snapshot.rngSeed);
            }
        } else if (!providedRng) {
            state.rngSeed = null;
            baseRng = null;
        }
    }

    return {
        emit,
        serializeState,
        hydrateState
    };
}

export default createNarrativeSystem;
