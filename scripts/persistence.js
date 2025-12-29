/**
 * Persistence and leaderboard utilities for the Wargame prototype.
 * The functions here are written to be browser-friendly while also
 * supporting simple Node-based tests via CommonJS exports.
 */
/**
 * Build the persistence API against a provided global-like scope.
 * @param {Window|Object} global host scope for storage and constants.
 * @returns {Object} persistence API with save/load helpers.
 */
function createPersistence(global) {
    const imperialFavorHelpers = (typeof require === 'function')
        ? require('./imperialFavor.js')
        : global.ImperialFavor;
    const { DEFAULT_IMPERIAL_FAVOR = 5, clampImperialFavor = (value) => {
        const numeric = Number.isFinite(value) ? Math.round(value) : DEFAULT_IMPERIAL_FAVOR;
        return Math.min(10, Math.max(1, numeric));
    } } = imperialFavorHelpers || {};
    const STORAGE_PREFIX = 'hexWar_slot';
    const STATS_PREFIX = 'hexWar_stats_slot';
    const STORAGE_KEY = `${STORAGE_PREFIX}1`;
    const STATS_KEY = `${STATS_PREFIX}1`;
    const DEFAULT_DAYS_PER_WEEK = 7;
    const DEFAULT_WEEKS_PER_MONTH = 4;
    const DEFAULT_START_MONTH_INDEX = Number.isFinite(global.START_MONTH_INDEX) ? global.START_MONTH_INDEX : 3;
    const DEFAULT_START_TICK = Number.isFinite(global.START_TICK)
        ? global.START_TICK
        : DEFAULT_START_MONTH_INDEX * DEFAULT_DAYS_PER_WEEK * DEFAULT_WEEKS_PER_MONTH;
    const DEFAULT_TIMEKEEPER = {
        ticks: DEFAULT_START_TICK,
        daysPerWeek: DEFAULT_DAYS_PER_WEEK,
        weeksPerMonth: DEFAULT_WEEKS_PER_MONTH
    };
    const DEFAULT_STATS = {
        totalKills: 0,
        bestKills: 0,
        bestLevel: 0,
        warsWon: 0,
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

    /**
     * Build a storage adapter wrapper so persistence can swap localStorage
     * for remote/async implementations without rewriting consumers.
     * @param {object|null} storage backing store that exposes getItem/setItem/removeItem.
     * @returns {{getItem: function, setItem: function, removeItem: function, keys: function}} adapter surface.
     */
    function createStorageAdapter(storage) {
        const backing = storage || null;
        const listKeys = () => {
            if (!backing) return [];
            if (typeof backing.keys === 'function') return Array.from(backing.keys());
            if (typeof backing.length === 'number' && typeof backing.key === 'function') {
                const keys = [];
                for (let i = 0; i < backing.length; i += 1) {
                    const key = backing.key(i);
                    if (key) keys.push(key);
                }
                return keys;
            }
            return Object.keys(backing);
        };

        return {
            getItem(key) {
                if (!backing || typeof backing.getItem !== 'function') return null;
                return backing.getItem(key);
            },
            setItem(key, value) {
                if (!backing || typeof backing.setItem !== 'function') return null;
                return backing.setItem(key, value);
            },
            removeItem(key) {
                if (!backing || typeof backing.removeItem !== 'function') return null;
                return backing.removeItem(key);
            },
            keys: listKeys
        };
    }

    const defaultStorageAdapter = createStorageAdapter(typeof global.localStorage !== 'undefined' ? global.localStorage : null);
    let storageAdapter = defaultStorageAdapter;

    /**
     * Swap the persistence adapter at runtime. Useful for remote or mocked storage layers.
     * @param {object} adapter custom adapter exposing getItem/setItem/removeItem/keys.
     * @returns {object} the active adapter after mutation.
     */
    function setStorageAdapter(adapter) {
        const hasSurface = adapter
            && typeof adapter.getItem === 'function'
            && typeof adapter.setItem === 'function'
            && typeof adapter.removeItem === 'function'
            && typeof adapter.keys === 'function';
        const isStorageLike = adapter
            && typeof adapter.getItem === 'function'
            && typeof adapter.setItem === 'function'
            && typeof adapter.removeItem === 'function';
        if (hasSurface) {
            storageAdapter = adapter;
        } else if (isStorageLike) {
            storageAdapter = createStorageAdapter(adapter);
        } else {
            storageAdapter = defaultStorageAdapter;
        }
        return storageAdapter;
    }

    /**
     * Introspect the current adapter for testing and debugging.
     * @returns {object} currently configured storage adapter.
     */
    function getStorageAdapter() {
        return storageAdapter;
    }

    /**
     * Safely parse JSON from the active storage adapter.
     * @param {string} key storage key to read.
     * @param {object} [adapter] optional adapter override for tests.
     * @returns {object|null} parsed payload or null when missing/invalid.
     */
    function readFromStorage(key, adapter = storageAdapter) {
        if (!adapter) return null;
        const raw = adapter.getItem(key);
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
     * @returns {string} storage key for the slot.
     */
    function storageKeyForSlot(slot) {
        return `${STORAGE_PREFIX}${slot}`;
    }

    /**
     * Generate the storage key for leaderboard stats tied to a save slot.
     * @param {string|number} slot user-facing slot number.
     * @returns {string} storage key for the slot's stats.
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
     * Keep difficulty and wars-won counters aligned when loading snapshots.
     * Uses the highest known value to avoid losing progress and clamps
     * to a non-negative integer. If both values are missing, the fallback
     * difficulty is applied.
     *
     * @param {object|null} state hydrated or raw state payload.
     * @param {object|null} stats hydrated or raw stats payload.
     * @param {object} [options]
     * @param {number} [options.fallbackDifficulty=0] fallback difficulty when neither value is set.
     * @returns {{state: object|null, stats: object|null, difficulty: number, warsWon: number}} aligned payloads.
     */
    function reconcileDifficultyAndWarsWon(state, stats, { fallbackDifficulty = 0 } = {}) {
        const fallback = Number.isFinite(fallbackDifficulty) ? fallbackDifficulty : 0;
        const difficultyValue = Number.isFinite(state?.difficulty)
            ? Math.max(0, Math.floor(state.difficulty))
            : null;
        const warsWonValue = Number.isFinite(stats?.warsWon)
            ? Math.max(0, Math.floor(stats.warsWon))
            : null;
        const resolved = Number.isFinite(difficultyValue) && Number.isFinite(warsWonValue)
            ? Math.max(difficultyValue, warsWonValue)
            : (Number.isFinite(difficultyValue) ? difficultyValue : (Number.isFinite(warsWonValue) ? warsWonValue : fallback));

        return {
            state: state ? { ...state, difficulty: resolved } : state,
            stats: stats ? { ...stats, warsWon: resolved } : stats,
            difficulty: resolved,
            warsWon: resolved
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
     * @param {object} [options]
     * @param {function} [options.mandateSerializer] optional override for mandate serialization.
     * @returns {object} snapshot that can be persisted.
     */
    function serializeGameState(game, options = {}) {
        const overwriteStats = normalizeStats(game.stats || {});
        const timekeeper = normalizeTimekeeperSnapshot(game.timekeeper);
        const mandateSerializer = options.mandateSerializer
            || game.imperialMandates?.serializeState
            || global.ImperialMandates?.serializeState;
        const mandates = typeof mandateSerializer === 'function'
            ? mandateSerializer.call(game.imperialMandates || global.ImperialMandates)
            : undefined;
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
     * Build a set of allowed overworld tile ids by pulling from live config when available
     * and falling back to the default tiles used across the prototype. This guards against
     * malformed save payloads injecting unexpected tile types during deserialization.
     * @param {object} [options]
     * @param {Array<string>} [options.allowedTileIds] optional override to tighten allowed ids.
     * @returns {Set<string>} all recognized overworld tile identifiers.
     */
    function getAllowedTileIds(options = {}) {
        if (Array.isArray(options.allowedTileIds)) {
            return new Set(options.allowedTileIds.map(id => String(id).toLowerCase()));
        }
        const fallback = [
            'castle',
            'field',
            'forest',
            'town',
            'scorched',
            'rebelcamp',
            'mine',
            'shrine',
            'ruin'
        ];

        const fromGlobal = global.OVERWORLD_TILES && typeof global.OVERWORLD_TILES === 'object'
            ? Object.values(global.OVERWORLD_TILES)
                .map(entry => entry?.id)
                .filter(Boolean)
            : [];

        return new Set([...fallback, ...fromGlobal]);
    }

    /**
     * Normalize potentially untrusted overworld tile data coming from persistence.
     * Accepts an optional hexFactory so tests can supply a stub Hex implementation.
     * @param {object} snapshot payload from storage.
     * @param {object} [options]
     * @param {function} [options.hexFactory] factory returning a Hex-like object with toString().
     * @param {Array<string>} [options.allowedTileIds] optional whitelist for tile ids.
     * @returns {object|null} hydrated game data or null when snapshot is missing.
     */
    function deserializeGameState(snapshot, options = {}) {
        if (!snapshot) return null;
        const allowedTileIds = getAllowedTileIds(options);
        const allowedOwners = new Set([null, 'player', 'rebel', 'scorched', 'enemy', 'neutral']);
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
            if (!Number.isFinite(q) || !Number.isFinite(r) || !Number.isFinite(s)) return;
            let normalizedType = typeof type === 'string' ? type.toLowerCase() : null;
            if (normalizedType === 'rebel') normalizedType = 'rebelcamp';
            if (!normalizedType || !allowedTileIds.has(normalizedType)) return;

            let normalizedOwner = null;
            if (owner !== undefined && owner !== null) {
                const lowerOwner = typeof owner === 'string' ? owner.toLowerCase() : null;
                normalizedOwner = allowedOwners.has(lowerOwner) ? lowerOwner : null;
            }

            const hex = makeHex(q, r, s);
            if (normalizedType === 'rebelcamp' && !normalizedOwner) {
                normalizedOwner = 'rebel';
            }
            const payload = {
                hex,
                type: normalizedType,
                owner: normalizedOwner,
                isRebelCamp: normalizedType === 'rebelcamp'
            };
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
     * Storage writes are wrapped so quota/unavailable adapters never crash the game loop.
     * @param {object} game current Game instance.
     * @param {string|number} [slot='1'] slot number to persist into.
     * @returns {{savedAt: string, payload: object, slot: string, success: boolean, error?: string}} time, payload, and status details.
     */
    function saveSnapshot(game, slot = '1') {
        const payload = serializeGameState(game);
        const savedAt = new Date().toISOString();
        const slotKey = storageKeyForSlot(slot);
        const statKey = statsKeyForSlot(slot);
        payload.stats.lastSaveISO = savedAt;
        if (!storageAdapter) {
            console.warn('Save skipped: storage unavailable.');
            return {
                savedAt,
                payload,
                slot: String(slot),
                success: false,
                error: 'unavailable'
            };
        }

        try {
            storageAdapter.setItem(slotKey, JSON.stringify(payload));
            storageAdapter.setItem(statKey, JSON.stringify(payload.stats));
            return { savedAt, payload, slot: String(slot), success: true };
        } catch (error) {
            const isQuotaExceeded = error?.name === 'QuotaExceededError' || error?.code === 22;
            const errorCode = isQuotaExceeded ? 'quota-exceeded' : 'write-failed';
            console.warn('Failed to persist snapshot', error);
            return {
                savedAt,
                payload,
                slot: String(slot),
                success: false,
                error: errorCode
            };
        }
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
        if (!storageAdapter) return;
        if (slot) {
            storageAdapter.removeItem(storageKeyForSlot(slot));
            storageAdapter.removeItem(statsKeyForSlot(slot));
            return;
        }
        storageAdapter.keys()
            .filter(key => key.startsWith(STORAGE_PREFIX) || key.startsWith(STATS_PREFIX))
            .forEach(key => storageAdapter.removeItem(key));
    }

    /**
     * Check if storage currently holds a save file in the desired slot.
     * @param {string|number} [slot='1'] slot identifier.
     * @returns {boolean} true when a save payload exists.
     */
    function hasSnapshot(slot = '1') {
        if (!storageAdapter) return false;
        return Boolean(storageAdapter.getItem(storageKeyForSlot(slot)));
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

    /** Pure snapshot helpers with no storage side effects for tests and remote adapters. */
    const SnapshotSerializer = {
        serialize: serializeGameState,
        deserialize: deserializeGameState
    };

    /** Expose stat normalization and clamping helpers separately for reuse. */
    const StatHelpers = {
        normalizeStats,
        clampImperialFavor,
        normalizeTimekeeperSnapshot,
        reconcileDifficultyAndWarsWon
    };

    const api = {
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
        statsKeyForSlot,
        createStorageAdapter,
        setStorageAdapter,
        getStorageAdapter,
        SnapshotSerializer,
        StatHelpers
    };
    return api;
}

const Persistence = createPersistence(typeof window !== 'undefined' ? window : globalThis);

/**
 * Register the persistence API on the provided global scope.
 * @param {Window|Object} [target] global object to attach Persistence to.
 * @returns {Object} Persistence helper API.
 */
function initPersistence(target = typeof window !== 'undefined' ? window : globalThis) {
    if (target) {
        target.Persistence = Persistence;
    }
    return Persistence;
}

export { createPersistence, Persistence, initPersistence };

if (typeof module !== 'undefined' && module.exports) {
    Persistence.initPersistence = initPersistence;
    Persistence.createPersistence = createPersistence;
    module.exports = Persistence;
}
