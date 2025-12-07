/**
 * Persistence and leaderboard utilities for the Wargame prototype.
 * The functions here are written to be browser-friendly while also
 * supporting simple Node-based tests via CommonJS exports.
 */
(function (global) {
    const STORAGE_PREFIX = 'hexWar_slot';
    const STATS_PREFIX = 'hexWar_stats_slot';
    const STORAGE_KEY = `${STORAGE_PREFIX}1`;
    const STATS_KEY = `${STATS_PREFIX}1`;
    const DEFAULT_IMPERIAL_FAVOR = 5;
    const DEFAULT_TIMEKEEPER = {
        ticks: 0,
        daysPerWeek: 8,
        weeksPerMonth: 5
    };
    const DEFAULT_STATS = {
        totalKills: 0,
        bestKills: 0,
        bestLevel: 0,
        warsFought: 0,
        lastOutcome: 'N/A',
        lastSaveISO: null
    };

    /**
     * Normalize leaderboard stats and translate legacy save keys into the UI schema.
     * @param {object} stats raw stats payload from the game or storage.
     * @returns {object} stats hydrated with defaults and modern field names.
     */
    function normalizeStats(stats = {}) {
        const normalized = { ...DEFAULT_STATS, ...stats };
        const hasBestLevel = Object.prototype.hasOwnProperty.call(stats, 'bestLevel');
        const hasWarsFought = Object.prototype.hasOwnProperty.call(stats, 'warsFought');
        if (!hasBestLevel && Number.isFinite(stats.bestDifficulty)) {
            normalized.bestLevel = stats.bestDifficulty;
        }
        if (!hasWarsFought && Number.isFinite(stats.warsPlayed)) {
            normalized.warsFought = stats.warsPlayed;
        }
        return normalized;
    }

    /** Clamp imperial favor to the 1–10 HUD range for persistence. */
    function clampImperialFavor(value) {
        const numeric = Number.isFinite(value) ? Math.round(value) : DEFAULT_IMPERIAL_FAVOR;
        return Math.min(10, Math.max(1, numeric));
    }

    /**
     * Safely parse JSON from storage.
     * @param {string} key localStorage key to read.
     * @returns {object|null} parsed payload or null when missing/invalid.
     */
    function readFromStorage(key) {
        if (typeof global.localStorage === 'undefined') return null;
        const raw = global.localStorage.getItem(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (err) {
            console.warn('Failed to parse stored data', err);
            return null;
        }
    }

    /**
     * Generate the storage key for a save slot.
     * @param {string|number} slot user-facing slot number.
     * @returns {string} localStorage key for the slot.
     */
    function storageKeyForSlot(slot) {
        return `${STORAGE_PREFIX}${slot}`;
    }

    /**
     * Generate the storage key for leaderboard stats tied to a save slot.
     * @param {string|number} slot user-facing slot number.
     * @returns {string} localStorage key for the slot's stats.
     */
    function statsKeyForSlot(slot) {
        return `${STATS_PREFIX}${slot}`;
    }

    /**
     * Normalize overloaded slot + options arguments for load routines.
     * @param {string|number|object} slotOrOptions slot or options object.
     * @param {object} [options] optional options when slot is provided first.
     * @returns {{slot: string, options: object}} normalized params.
     */
    function normalizeSlotAndOptions(slotOrOptions, options = {}) {
        if (typeof slotOrOptions === 'string' || typeof slotOrOptions === 'number') {
            return { slot: String(slotOrOptions), options };
        }
        return { slot: '1', options: slotOrOptions || {} };
    }

    /** Normalize a raw timekeeper snapshot into a safe payload. */
    function normalizeTimekeeperSnapshot(snapshot = {}) {
        return {
            ticks: Math.max(0, Number.isFinite(snapshot.ticks) ? snapshot.ticks : DEFAULT_TIMEKEEPER.ticks),
            daysPerWeek: Math.max(1, Number.isFinite(snapshot.daysPerWeek) ? snapshot.daysPerWeek : DEFAULT_TIMEKEEPER.daysPerWeek),
            weeksPerMonth: Math.max(1, Number.isFinite(snapshot.weeksPerMonth) ? snapshot.weeksPerMonth : DEFAULT_TIMEKEEPER.weeksPerMonth)
        };
    }

    /**
     * Merge queue + in-flight notification payloads into a minimal rehydration list.
     * @param {object} game live game object that may expose a notification stack getter.
     * @returns {Array<object>} normalized notification payloads safe for persistence.
     */
    function snapshotNotifications(game) {
        if (!game || typeof game.getNotificationStack !== 'function') return [];
        const stack = game.getNotificationStack();
        if (!stack) return [];

        const normalizePayload = (item) => {
            if (!item) return null;
            const lines = Array.isArray(item.lines)
                ? item.lines
                : (item.lines ? [item.lines] : []);
            return {
                id: item.id,
                title: item.title,
                lines,
                duration: Number.isFinite(item.duration) ? item.duration : undefined,
                tone: item.tone
            };
        };

        const pending = [];
        if (Array.isArray(stack.queue)) pending.push(...stack.queue);
        if (stack.visible instanceof Map) {
            stack.visible.forEach((entry) => {
                if (entry?.item) pending.push(entry.item);
                else if (entry) pending.push(entry);
            });
        }

        const seen = new Set();
        return pending
            .map(normalizePayload)
            .filter(Boolean)
            .filter((item) => {
                const id = item.id || `${item.title || ''}-${item.lines?.[0] || ''}`;
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });
    }

    /**
     * Serialize the current game state into a JSON-friendly snapshot.
     * Only serializes deterministic, overworld-friendly data (combat is excluded).
     * @param {object} game reference to the main Game singleton.
     * @returns {object} snapshot that can be persisted.
     */
    function serializeGameState(game) {
        const overwriteStats = normalizeStats(game.stats || {});
        const timekeeper = normalizeTimekeeperSnapshot(game.timekeeper);
        const mandates = game.imperialMandates?.serializeState?.()
            || global.ImperialMandates?.serializeState?.();
        return {
            gold: game.gold,
            wood: game.wood,
            difficulty: game.difficulty,
            upgrades: { ...game.upgrades },
            research: {
                technologies: Array.from(game.research?.technologies || []).map(t => ({
                    id: t.id,
                    purchased: Boolean(t.purchased),
                    timesPurchased: t.timesPurchased || 0
                })),
                lives: game.research?.lives || 0
            },
            imperialFavor: clampImperialFavor(game.imperialFavor),
            timekeeper,
            overworld: {
                hexes: Array.from(game.overworld.hexes.values()).map(({ hex, type, owner }) => ({
                    q: hex.q,
                    r: hex.r,
                    s: hex.s,
                    type,
                    owner: owner ?? null
                }))
            },
            stats: overwriteStats,
            notifications: snapshotNotifications(game),
            mandates
        };
    }

    /**
     * Rebuild a snapshot into live data structures.
     * Accepts an optional hexFactory so tests can supply a stub Hex implementation.
     * @param {object} snapshot payload from storage.
     * @param {object} [options]
     * @param {function} [options.hexFactory] factory returning a Hex-like object with toString().
     * @returns {object|null} hydrated game data or null when snapshot is missing.
     */
    function deserializeGameState(snapshot, options = {}) {
        if (!snapshot) return null;
        const makeHex =
            options.hexFactory ||
            ((q, r, s) => {
                if (typeof global.Hex === 'function') return new global.Hex(q, r, s);
                return {
                    q,
                    r,
                    s,
                    toString() {
                        return `${this.q},${this.r}`;
                    }
                };
            });

        const overworldHexes = new Map();
        (snapshot.overworld?.hexes || []).forEach(({ q, r, s, type, owner }) => {
            const hex = makeHex(q, r, s);
            const payload = { hex, type };
            if (owner !== undefined) payload.owner = owner;
            overworldHexes.set(hex.toString(), payload);
        });

        return {
            gold: snapshot.gold ?? 0,
            wood: snapshot.wood ?? 0,
            difficulty: snapshot.difficulty ?? 0,
            imperialFavor: clampImperialFavor(snapshot.imperialFavor),
            timekeeper: normalizeTimekeeperSnapshot(snapshot.timekeeper),
            upgrades: snapshot.upgrades || {},
            research: snapshot.research || {},
            overworld: { hexes: overworldHexes },
            stats: normalizeStats(snapshot.stats),
            notifications: Array.isArray(snapshot.notifications) ? snapshot.notifications : [],
            mandates: snapshot.mandates || null
        };
    }

    /**
     * Save the game snapshot + leaderboard stats to a specific save slot.
     * @param {object} game current Game instance.
     * @param {string|number} [slot='1'] slot number to persist into.
     * @returns {{savedAt: string, payload: object, slot: string}} time and payload details for UI/debugging.
     */
    function saveSnapshot(game, slot = '1') {
        const payload = serializeGameState(game);
        const savedAt = new Date().toISOString();
        const slotKey = storageKeyForSlot(slot);
        const statKey = statsKeyForSlot(slot);
        payload.stats.lastSaveISO = savedAt;
        if (typeof global.localStorage !== 'undefined') {
            global.localStorage.setItem(slotKey, JSON.stringify(payload));
            global.localStorage.setItem(statKey, JSON.stringify(payload.stats));
        }
        return { savedAt, payload, slot: String(slot) };
    }

    /**
     * Load the saved snapshot for a specific slot, if present.
     * @param {string|number|object} [slotOrOptions] slot identifier or options object.
     * @param {object} [options] passthrough options for deserialization when slot is provided first.
     * @returns {{state: object|null, stats: object, slot: string}} hydrated state + stats.
     */
    function loadSnapshot(slotOrOptions = {}, options = {}) {
        const { slot, options: normalizedOptions } = normalizeSlotAndOptions(slotOrOptions, options);
        const rawState = readFromStorage(storageKeyForSlot(slot));
        const rawStats = readFromStorage(statsKeyForSlot(slot));
        const stats = normalizeStats(rawStats || rawState?.stats);
        return {
            state: deserializeGameState(rawState, normalizedOptions),
            stats,
            slot
        };
    }

    /**
     * Remove all stored progress and leaderboard data for a slot, or every slot when none is provided.
     * @param {string|number} [slot] optional slot to target; clears every slot when omitted.
     */
    function clearSnapshot(slot) {
        if (typeof global.localStorage === 'undefined') return;
        if (slot) {
            global.localStorage.removeItem(storageKeyForSlot(slot));
            global.localStorage.removeItem(statsKeyForSlot(slot));
            return;
        }
        Object.keys(global.localStorage)
            .filter(key => key.startsWith(STORAGE_PREFIX) || key.startsWith(STATS_PREFIX))
            .forEach(key => global.localStorage.removeItem(key));
    }

    /**
     * Check if storage currently holds a save file in the desired slot.
     * @param {string|number} [slot='1'] slot identifier.
     * @returns {boolean} true when a save payload exists.
     */
    function hasSnapshot(slot = '1') {
        if (typeof global.localStorage === 'undefined') return false;
        return Boolean(global.localStorage.getItem(storageKeyForSlot(slot)));
    }

    /**
     * Inspect a slot without deserializing the entire payload.
     * @param {string|number} slot slot identifier.
     * @returns {{slot: string, hasSave: boolean, lastSaveISO: string|null, level: number|null}} snapshot metadata.
     */
    function getSlotMetadata(slot) {
        const state = readFromStorage(storageKeyForSlot(slot));
        if (!state) return { slot: String(slot), hasSave: false, lastSaveISO: null, level: null };
        const level = typeof state.difficulty === 'number' ? state.difficulty : null;
        const lastSaveISO = state.stats?.lastSaveISO || null;
        return { slot: String(slot), hasSave: true, lastSaveISO, level };
    }

    global.Persistence = {
        STORAGE_KEY,
        STORAGE_PREFIX,
        STATS_KEY,
        STATS_PREFIX,
        DEFAULT_IMPERIAL_FAVOR,
        DEFAULT_STATS,
        serializeGameState,
        deserializeGameState,
        saveSnapshot,
        loadSnapshot,
        clearSnapshot,
        hasSnapshot,
        getSlotMetadata,
        storageKeyForSlot,
        statsKeyForSlot
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.Persistence;
    }
})(typeof window !== 'undefined' ? window : globalThis);
