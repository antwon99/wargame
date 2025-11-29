/**
 * Persistence and leaderboard utilities for the Wargame prototype.
 * The functions here are written to be browser-friendly while also
 * supporting simple Node-based tests via CommonJS exports.
 */
(function (global) {
    const STORAGE_KEY = 'wargame-save-v1';
    const STATS_KEY = 'wargame-stats-v1';
    const DEFAULT_STATS = {
        totalKills: 0,
        bestKills: 0,
        bestDifficulty: 0,
        warsPlayed: 0,
        lastOutcome: 'N/A',
        lastSaveISO: null
    };

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
     * Serialize the current game state into a JSON-friendly snapshot.
     * Only serializes deterministic, overworld-friendly data (combat is excluded).
     * @param {object} game reference to the main Game singleton.
     * @returns {object} snapshot that can be persisted.
     */
    function serializeGameState(game) {
        const overwriteStats = game.stats || {};
        return {
            gold: game.gold,
            wood: game.wood,
            difficulty: game.difficulty,
            upgrades: { ...game.upgrades },
            overworld: {
                hexes: Array.from(game.overworld.hexes.values()).map(({ hex, type }) => ({
                    q: hex.q,
                    r: hex.r,
                    s: hex.s,
                    type
                }))
            },
            stats: { ...DEFAULT_STATS, ...overwriteStats }
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
        (snapshot.overworld?.hexes || []).forEach(({ q, r, s, type }) => {
            const hex = makeHex(q, r, s);
            overworldHexes.set(hex.toString(), { hex, type });
        });

        return {
            gold: snapshot.gold ?? 0,
            wood: snapshot.wood ?? 0,
            difficulty: snapshot.difficulty ?? 0,
            upgrades: snapshot.upgrades || {},
            overworld: { hexes: overworldHexes },
            stats: { ...DEFAULT_STATS, ...(snapshot.stats || {}) }
        };
    }

    /**
     * Save the game snapshot + leaderboard stats to localStorage.
     * @param {object} game current Game instance.
     * @returns {{savedAt: string, payload: object}} time and payload details for UI/debugging.
     */
    function saveSnapshot(game) {
        const payload = serializeGameState(game);
        const savedAt = new Date().toISOString();
        payload.stats.lastSaveISO = savedAt;
        if (typeof global.localStorage !== 'undefined') {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            global.localStorage.setItem(STATS_KEY, JSON.stringify(payload.stats));
        }
        return { savedAt, payload };
    }

    /**
     * Load the last saved snapshot, if present.
     * @param {object} [options] passthrough options for deserialization.
     * @returns {{state: object|null, stats: object}} hydrated state + stats.
     */
    function loadSnapshot(options = {}) {
        const rawState = readFromStorage(STORAGE_KEY);
        const rawStats = readFromStorage(STATS_KEY);
        return {
            state: deserializeGameState(rawState, options),
            stats: { ...DEFAULT_STATS, ...(rawStats || rawState?.stats || {}) }
        };
    }

    /**
     * Remove all stored progress and leaderboard data.
     */
    function clearSnapshot() {
        if (typeof global.localStorage === 'undefined') return;
        global.localStorage.removeItem(STORAGE_KEY);
        global.localStorage.removeItem(STATS_KEY);
    }

    /**
     * Check if storage currently holds a save file.
     * @returns {boolean} true when a save payload exists.
     */
    function hasSnapshot() {
        if (typeof global.localStorage === 'undefined') return false;
        return Boolean(global.localStorage.getItem(STORAGE_KEY));
    }

    global.Persistence = {
        STORAGE_KEY,
        STATS_KEY,
        DEFAULT_STATS,
        serializeGameState,
        deserializeGameState,
        saveSnapshot,
        loadSnapshot,
        clearSnapshot,
        hasSnapshot
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.Persistence;
    }
})(typeof window !== 'undefined' ? window : globalThis);
