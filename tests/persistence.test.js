import assert from 'assert';
import { clampImperialFavor } from '../scripts/imperialFavor.js';
import { canUseLocalStorage, initStorageProbe } from '../scripts/storageProbe.js';
import Persistence from '../scripts/persistence.js';

initStorageProbe?.(globalThis);

global.localStorage = (() => {
    const quotaBytes = 5 * 1024 * 1024;
    const store = new Map();
    const storedBytes = () => Array.from(store, ([key, value]) => (key.length + value.length) * 2)
        .reduce((total, entryBytes) => total + entryBytes, 0);
    return {
        getItem: key => store.get(key) || null,
        setItem: (key, value) => {
            const normalizedKey = String(key);
            const normalizedValue = String(value);
            const previousValue = store.get(normalizedKey);
            const previousBytes = previousValue === undefined
                ? 0
                : (normalizedKey.length + previousValue.length) * 2;
            const nextBytes = (normalizedKey.length + normalizedValue.length) * 2;

            if (storedBytes() - previousBytes + nextBytes > quotaBytes) {
                const error = new Error('Storage quota exceeded');
                error.name = 'QuotaExceededError';
                error.code = 22;
                throw error;
            }

            store.set(normalizedKey, normalizedValue);
        },
        removeItem: key => store.delete(key),
        clear: () => store.clear(),
        key: index => Array.from(store.keys())[index] || null,
        get length() { return store.size; },
        keys: () => Array.from(store.keys())
    };
})();

const Hex = class Hex {
    constructor(q, r, s) { this.q = q; this.r = r; this.s = s; }
    toString() { return `${this.q},${this.r}`; }
};
global.Hex = Hex;

assert.strictEqual(
    typeof Persistence.serializeGameState,
    'function',
    'Persistence should expose serializeGameState for persistence snapshots'
);
Persistence.initPersistence?.(globalThis);
Persistence.setStorageAdapter(Persistence.createStorageAdapter(global.localStorage));

async function runTests() {
    const { Timekeeper, START_TICK } = await import('../scripts/timekeeper.js');
    const INCOME_TABLE = {
        castle: { gold: 2, wood: 1 },
        town: { gold: 2 },
        forest: { wood: 1 },
        field: {},
        scorched: {},
        rebelcamp: {},
        mine: { gold: 3 },
        shrine: {},
        ruin: { gold: 1 }
    };

    const calcIncome = (hexMap) => {
        let gold = 0;
        let wood = 0;
        hexMap.forEach((tile) => {
            const owner = (tile.owner || '').toLowerCase();
            const isRebelCamp = tile.type === 'rebelcamp' || tile.isRebelCamp;
            if (owner === 'scorched' || isRebelCamp) return;
            const type = typeof tile.type === 'string' ? tile.type.toLowerCase() : '';
            const income = INCOME_TABLE[type] || {};
            if (income.gold) gold += income.gold;
            if (income.wood) wood += income.wood;
        });
        return { gold, wood };
    };

    assert.strictEqual(
        canUseLocalStorage({ localStorage: global.localStorage }, { silent: true }),
        true,
        'probe should allow usable storage'
    );
    assert.throws(
        () => global.localStorage.setItem('oversized', 'x'.repeat(3 * 1024 * 1024)),
        error => error?.name === 'QuotaExceededError' && error?.code === 22,
        'mock storage should enforce its five-megabyte quota'
    );
    assert.strictEqual(
        global.localStorage.getItem('oversized'),
        null,
        'failed quota writes should not alter mock storage'
    );
    const throwingStorage = { get localStorage() { throw new Error('denied'); } };
    assert.strictEqual(
        canUseLocalStorage(throwingStorage, { silent: true }),
        false,
        'probe should fail when accessors throw'
    );
    let safePersistence = null;
    assert.doesNotThrow(() => {
        safePersistence = Persistence.createPersistence(throwingStorage);
    }, 'createPersistence should tolerate throwing localStorage accessors');
    const safeAdapter = safePersistence.getStorageAdapter();
    assert.strictEqual(safeAdapter.getItem('missing'), null, 'safe adapter should treat inaccessible storage as empty');
    assert.deepStrictEqual(safeAdapter.keys(), [], 'safe adapter should report no keys when storage is inaccessible');

    // Serialize
    const mandateSnapshot = {
        currentTick: 7,
        lastIssuedTick: 6,
        mandates: {
            levy_tithed_gold: {
                status: 'ACTIVE',
                deadlineTick: 21,
                issuedTick: 14,
                metadata: { requiredGold: 180 }
            }
        }
    };

    const notificationStack = {
        queue: [{ id: 'queued', title: 'Queued', lines: ['Awaiting'], duration: 1234 }],
        visible: new Map([
            ['v1', { item: { id: 'live', title: 'Live', lines: ['Active'], duration: 1500, tone: 'warning' } }]
        ])
    };
    const narrativeSnapshot = {
        weeklyCounts: { '4': { 'archivist:economy': 1 } },
        lastBeatTicks: { 'archivist:economy': 12 },
        rngSeed: 314159
    };
    const factionState = {
        standings: { crown: 62, reformers: 48, guilds: 70, masses: 55, frontier: 41 },
        recentContributors: { crown: ['taxes'], reformers: [], guilds: [], masses: [], frontier: ['rebels'] }
    };

    const game = {
        gold: 100,
        wood: 50,
        difficulty: 2,
        imperialFavor: 7,
        timekeeper: { ticks: 12, daysPerWeek: 5, weeksPerMonth: 3 },
        upgrades: { soldier: 1 },
        ultimates: { rush: 2, gold: 3 },
        overworld: {
            hexes: new Map([
                ['0,0', { hex: new Hex(0, 0, 0), type: 'castle' }],
                ['1,0', { hex: new Hex(1, 0, -1), type: 'field' }]
            ])
        },
        tutorial: {
            frontierSweep: {
                targetTileKey: '0,0',
                spreadImmune: true,
                source: 'mandate',
                enemyLevel: 1,
                issuedTick: 3
            }
        },
        stats: { totalKills: 5 },
        factionState,
        getNotificationStack: () => notificationStack,
        imperialMandates: { serializeState: () => mandateSnapshot },
        narrative: { serializeState: () => narrativeSnapshot }
    };
    const snap = Persistence.serializeGameState(game);
    assert.strictEqual(snap.overworld.hexes.length, 2);
    assert.strictEqual(snap.stats.totalKills, 5);
    assert.strictEqual(snap.stats.bestKills, 0);
    assert.strictEqual(snap.stats.bestLevel, 0);
    assert.strictEqual(snap.stats.warsWon, 2);
    assert.strictEqual(snap.stats.warsFought, 0);
    assert.strictEqual(snap.stats.lastOutcome, 'N/A');
    assert.strictEqual(snap.gold, 100);
    assert.deepStrictEqual(snap.ultimates, { rush: 2, gold: 3 }, 'ultimate upgrades should persist');
    assert.strictEqual(snap.timekeeper.ticks, 12);
    assert.strictEqual(snap.timekeeper.daysPerWeek, 5);
    assert.strictEqual(snap.notifications.length, 2, 'pending notifications should persist');
    assert.strictEqual(snap.mandates.currentTick, mandateSnapshot.currentTick, 'mandate state should persist');
    assert.deepStrictEqual(snap.narrative, narrativeSnapshot, 'narrative state should persist');
    assert.deepStrictEqual(snap.factionState, factionState, 'faction state should persist');
    assert.strictEqual(snap.tutorial.frontierSweep.targetTileKey, '0,0', 'tutorial state should persist');

    const ultimateLevels = { rush: 4, manpower: 2, gold: 1 };
    const ultimateRoundTripGame = {
        gold: 0,
        wood: 0,
        difficulty: 0,
        imperialFavor: 0,
        timekeeper: { ticks: 0, daysPerWeek: 7, weeksPerMonth: 4 },
        upgrades: {},
        ultimates: ultimateLevels,
        overworld: { hexes: new Map() },
        stats: {},
        getNotificationStack: () => ({ queue: [], visible: new Map() })
    };
    const ultimateSnap = Persistence.serializeGameState(ultimateRoundTripGame);
    assert.deepStrictEqual(
        ultimateSnap.ultimates,
        ultimateLevels,
        'ultimate levels should serialize with their current upgrade values'
    );
    const ultimateResult = Persistence.deserializeGameState(ultimateSnap, {
        hexFactory: (q, r, s) => new Hex(q, r, s)
    });
    assert.deepStrictEqual(
        ultimateResult.ultimates,
        ultimateLevels,
        'ultimate levels should deserialize back to their saved values'
    );

    const difficultyAlignment = Persistence.StatHelpers.reconcileDifficultyAndWarsWon(
        { difficulty: 2 },
        { warsWon: 5 }
    );
    assert.strictEqual(difficultyAlignment.state.difficulty, 5, 'difficulty should reconcile to the saved wars-won value');
    assert.strictEqual(difficultyAlignment.stats.warsWon, 5, 'warsWon should remain the authoritative progress value');

    const lowerWarsWon = Persistence.StatHelpers.reconcileDifficultyAndWarsWon(
        { difficulty: 8 },
        { warsWon: 1 }
    );
    assert.strictEqual(lowerWarsWon.state.difficulty, 1, 'difficulty should follow stats.warsWon when provided');
    assert.strictEqual(lowerWarsWon.stats.warsWon, 1, 'warsWon should not be overridden by difficulty');

    const missingWarsWon = Persistence.StatHelpers.reconcileDifficultyAndWarsWon(
        { difficulty: 3 },
        { totalKills: 9 }
    );
    assert.strictEqual(missingWarsWon.stats.warsWon, 3, 'missing warsWon should inherit the current difficulty');

    const { normalizeStats } = Persistence.StatHelpers;
    assert.doesNotThrow(() => {
        normalizeStats(null);
    }, 'normalizeStats should not throw for null');
    assert.deepStrictEqual(
        normalizeStats(null),
        Persistence.DEFAULT_STATS,
        'null stats should normalize to defaults'
    );
    assert.doesNotThrow(() => {
        normalizeStats(undefined);
    }, 'normalizeStats should not throw for undefined');
    assert.deepStrictEqual(
        normalizeStats(undefined),
        Persistence.DEFAULT_STATS,
        'undefined stats should normalize to defaults'
    );

    // Deserialize
    const snapshot = {
        gold: 12,
        wood: 7,
        difficulty: 1,
        upgrades: { soldier: 2 },
        ultimates: { manpower: 2 },
        imperialFavor: 3,
        overworld: { hexes: [{ q: 0, r: 0, s: 0, type: 'castle' }] },
        stats: { totalKills: 3, bestDifficulty: 4, warsPlayed: 6 },
        timekeeper: { ticks: 4, daysPerWeek: 6, weeksPerMonth: 2 },
        notifications: [{ id: 'queued', title: 'Queued', lines: ['Awaiting'], duration: 1234 }],
        mandates: mandateSnapshot,
        narrative: narrativeSnapshot,
        factionState: { standings: { crown: 22 }, recentContributors: { crown: ['mandates'] } },
        tutorial: {
            frontierSweep: {
                targetTileKey: '2,0',
                spreadImmune: false,
                enemyLevel: 2,
                issuedTick: 9,
                completionTick: 12
            }
        }
    };
    const legacyMigrationLog = [];
    const result = Persistence.deserializeGameState(snapshot, {
        hexFactory: (q, r, s) => new Hex(q, r, s),
        migrationLog: legacyMigrationLog
    });
    assert.strictEqual(result.overworld.hexes.size, 1);
    const only = Array.from(result.overworld.hexes.values())[0];
    assert.deepStrictEqual(only.hex.q, 0);
    assert.strictEqual(result.stats.totalKills, 3);
    assert.strictEqual(result.stats.bestLevel, 4, 'legacy bestDifficulty should map to bestLevel');
    assert.strictEqual(result.stats.warsWon, 0, 'missing warsWon should hydrate to default');
    assert.strictEqual(result.stats.warsFought, 6, 'legacy warsPlayed should map to warsFought');
    assert.strictEqual(result.imperialFavor, 3);
    assert.strictEqual(result.timekeeper.ticks, 4);
    assert.strictEqual(result.timekeeper.daysPerWeek, 6);
    assert.deepStrictEqual(result.ultimates, { manpower: 2 }, 'ultimate upgrades should deserialize');
    assert.strictEqual(result.notifications.length, 1);
    assert.strictEqual(result.mandates.currentTick, mandateSnapshot.currentTick);
    assert.deepStrictEqual(result.narrative, narrativeSnapshot);
    assert.strictEqual(result.factionState.standings.crown, 22);
    assert.deepStrictEqual(result.factionState.recentContributors.crown, ['mandates']);
    assert.strictEqual(result.factionState.standings.reformers, 50, 'missing faction standings should default');
    assert.strictEqual(result.tutorial.frontierSweep.targetTileKey, '2,0', 'tutorial state should hydrate');
    assert.strictEqual(result.tutorial.frontierSweep.spreadImmune, false, 'tutorial spread immunity should hydrate');
    assert.ok(
        legacyMigrationLog.includes('stats.bestDifficulty'),
        'legacy stat migrations should be tracked for bestDifficulty'
    );
    assert.ok(
        legacyMigrationLog.includes('stats.warsPlayed'),
        'legacy stat migrations should be tracked for warsPlayed'
    );

    // Guard against malformed overworld tiles sneaking into state
    const malformedSnapshot = {
        overworld: {
            hexes: [
                { q: 0, r: 0, s: 0, type: 'castle', owner: 'player' },
                { q: 1, r: 0, s: -1, type: 'glitch', owner: 'cheater' },
                { q: 2, r: 0, s: -2, type: 'field', owner: 'bandit' },
                { q: 3, r: 0, s: -3, type: 'shrine', owner: 'REBEL' },
                { q: 'x', r: 0, s: 0, type: 'town', owner: 'neutral' }
            ]
        },
        stats: {}
    };
    const sanitized = Persistence.deserializeGameState(malformedSnapshot, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.strictEqual(sanitized.overworld.hexes.size, 3, 'invalid hex entries should be skipped');
    const sanitizedTypes = Array.from(sanitized.overworld.hexes.values()).map(t => t.type).sort();
    assert.deepStrictEqual(sanitizedTypes, ['castle', 'field', 'shrine'], 'only valid tile ids should survive');
    assert.strictEqual(sanitized.overworld.hexes.get('2,0').owner, null, 'unknown owners should be coerced to null');
    assert.strictEqual(sanitized.overworld.hexes.get('3,0').owner, 'rebel', 'recognized owners should be normalized to lowercase');

    const legacyRebelSnapshot = {
        overworld: {
            hexes: [
                { q: 4, r: 0, s: -4, type: 'rebel', owner: 'rebel' }
            ]
        },
        stats: {}
    };
    const legacyRebelMigrationLog = [];
    const legacyRebelState = Persistence.deserializeGameState(legacyRebelSnapshot, {
        hexFactory: (q, r, s) => new Hex(q, r, s),
        migrationLog: legacyRebelMigrationLog
    });
    const legacyRebelTile = legacyRebelState.overworld.hexes.get('4,0');
    assert.strictEqual(legacyRebelTile.type, 'rebelcamp', 'legacy rebel tiles should normalize to rebel camps');
    assert.strictEqual(legacyRebelTile.owner, 'rebel', 'legacy rebel ownership should persist');
    assert.strictEqual(legacyRebelTile.isRebelCamp, true, 'legacy rebels should carry camp metadata');
    assert.ok(
        legacyRebelMigrationLog.includes('overworld.tileType.rebel'),
        'legacy rebel tile migrations should be tracked'
    );

    // Legacy saves without timekeeper data should inherit calendar defaults
    const legacySnapshot = {
        gold: 10,
        wood: 2,
        difficulty: 0,
        upgrades: {},
        overworld: { hexes: [] },
        stats: {}
    };
    const legacyRestore = Persistence.deserializeGameState(legacySnapshot, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.strictEqual(legacyRestore.timekeeper.ticks, START_TICK, 'missing timekeeper ticks should align to the default start tick');
    assert.strictEqual(legacyRestore.timekeeper.daysPerWeek, 7, 'legacy saves should default to seven-day weeks');
    assert.strictEqual(legacyRestore.timekeeper.weeksPerMonth, 4, 'legacy saves should default to four-week months');
    assert.strictEqual(legacyRestore.narrative, null, 'legacy saves should default to empty narrative state');

    const restoredCalendar = new Timekeeper({
        startTick: legacyRestore.timekeeper.ticks,
        daysPerWeek: legacyRestore.timekeeper.daysPerWeek,
        weeksPerMonth: legacyRestore.timekeeper.weeksPerMonth
    }).getCalendar();
    const defaultCalendar = new Timekeeper().getCalendar();
    assert.deepStrictEqual(restoredCalendar, defaultCalendar, 'restored calendar math should match Timekeeper defaults');

    const legacySlot = 'legacy';
    const legacySlotKey = Persistence.storageKeyForSlot(legacySlot);
    global.localStorage.setItem(legacySlotKey, JSON.stringify({
        gold: 1,
        wood: 0,
        difficulty: 2,
        overworld: { hexes: [] },
        stats: { bestDifficulty: 1 }
    }));
    const loadMigrationLog = [];
    const legacyLoad = Persistence.loadSnapshot(legacySlot, {
        hexFactory: (q, r, s) => new Hex(q, r, s),
        migrationLog: loadMigrationLog
    });
    assert.ok(
        legacyLoad.migrations.includes('stats.bestDifficulty'),
        'loadSnapshot should surface legacy stat migrations'
    );
    assert.ok(
        legacyLoad.migrations.includes('stats.warsWonFromDifficulty'),
        'loadSnapshot should record warsWon migrations when falling back to difficulty'
    );

    // Save/Load via mocked storage
    const saveGame = {
        gold: 77,
        wood: 9,
        difficulty: 4,
        upgrades: { soldier: 3 },
        imperialFavor: 9,
        timekeeper: { ticks: 8, daysPerWeek: 7, weeksPerMonth: 4 },
        overworld: { hexes: new Map([['0,0', { hex: new Hex(0, 0, 0), type: 'castle' }]]) },
        stats: { totalKills: 11, bestKills: 13, bestLevel: 2, warsWon: 3, warsFought: 8, lastOutcome: 'VICTORY' },
        imperialMandates: { serializeState: () => ({
            currentTick: 10,
            lastIssuedTick: 8,
            mandates: {
                levy_tithed_gold: {
                    status: 'ACTIVE',
                    deadlineTick: 18,
                    issuedTick: 11,
                    metadata: { requiredGold: 140 }
                }
            }
        }) }
    };
    const primarySave = Persistence.saveSnapshot(saveGame, 1);
    assert.ok(primarySave.success, 'happy-path saves should succeed');
    const loaded = Persistence.loadSnapshot(1, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.ok(loaded.state);
    assert.strictEqual(loaded.state.gold, 77);
    assert.strictEqual(loaded.stats.totalKills, 11);
    assert.strictEqual(loaded.stats.bestKills, 13);
    assert.strictEqual(loaded.stats.bestLevel, 2);
    assert.strictEqual(loaded.stats.warsWon, 3);
    assert.strictEqual(loaded.stats.warsFought, 8);
    assert.strictEqual(loaded.stats.lastOutcome, 'VICTORY');
    assert.ok(loaded.stats.lastSaveISO, 'last save timestamp should be preserved');
    assert.strictEqual(loaded.state.imperialFavor, 9);
    assert.strictEqual(loaded.state.timekeeper.ticks, 8);
    assert.strictEqual(loaded.state.mandates.currentTick, 10);

    // Multi-slot isolation
    const altGame = { ...saveGame, gold: 999, imperialFavor: 12, stats: { totalKills: 42, bestLevel: 7, warsWon: 5, warsFought: 12 } };
    const altSave = Persistence.saveSnapshot(altGame, 2);
    assert.ok(altSave.success, 'secondary saves should succeed');
    const slotOne = Persistence.loadSnapshot(1, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    const slotTwo = Persistence.loadSnapshot(2, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.strictEqual(slotOne.state.gold, 77);
    assert.strictEqual(slotTwo.state.gold, 999);
    assert.strictEqual(slotTwo.stats.bestLevel, 7);
    assert.strictEqual(slotTwo.stats.warsWon, 5);
    assert.strictEqual(slotTwo.stats.warsFought, 12);
    assert.strictEqual(
        slotTwo.state.imperialFavor,
        clampImperialFavor(altGame.imperialFavor),
        'favor should clamp to 10 on persist/load'
    );

    const meta = Persistence.getSlotMetadata(2);
    assert.ok(meta.hasSave);
    assert.strictEqual(meta.slot, '2');

    // Favor updates from gameplay systems should persist
    const favorShiftGame = { ...saveGame, imperialFavor: 2 };
    const favorSave = Persistence.saveSnapshot(favorShiftGame, 6);
    assert.strictEqual(favorSave.payload.imperialFavor, 2, 'saves should capture the latest imperial favor value');

    favorShiftGame.imperialFavor = 15;
    const clampedFavorSave = Persistence.saveSnapshot(favorShiftGame, 7);
    assert.strictEqual(
        clampedFavorSave.payload.imperialFavor,
        clampImperialFavor(favorShiftGame.imperialFavor),
        'favor persistence should honor clamp limits'
    );

    // Persist scorched/rebel camp tiles and ensure they stay non-income when reloaded
    const penalizedGame = {
        gold: 0,
        wood: 0,
        difficulty: 0,
        upgrades: {},
        overworld: {
            hexes: new Map([
                ['0,0', { hex: new Hex(0, 0, 0), type: 'rebelcamp', owner: 'rebel', isRebelCamp: true }],
                [
                    '1,0',
                    {
                        hex: new Hex(1, 0, -1),
                        type: 'scorched',
                        owner: 'scorched',
                        prevType: 'forest',
                        scorchedBy: '0,0'
                    }
                ]
            ])
        },
        stats: {}
    };
    const savedPenalty = Persistence.saveSnapshot(penalizedGame, 5);
    assert.strictEqual(savedPenalty.payload.overworld.hexes.length, 2);

    const reloadedPenalty = Persistence.loadSnapshot(5, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.ok(reloadedPenalty.state);
    assert.strictEqual(reloadedPenalty.state.overworld.hexes.size, 2);
    const scorchedTile = reloadedPenalty.state.overworld.hexes.get('1,0');
    assert.strictEqual(scorchedTile.type, 'scorched');
    assert.strictEqual(scorchedTile.owner, 'scorched');
    assert.strictEqual(scorchedTile.prevType, 'forest');
    assert.strictEqual(scorchedTile.scorchedBy, '0,0');

    const rebelTile = reloadedPenalty.state.overworld.hexes.get('0,0');
    assert.strictEqual(rebelTile.owner, 'rebel');
    assert.strictEqual(rebelTile.type, 'rebelcamp');
    const income = calcIncome(reloadedPenalty.state.overworld.hexes);
    assert.deepStrictEqual(income, { gold: 0, wood: 0 });

    // Preserve exotic tiles and keep income lookups intact across save/load
    const exoticGame = {
        gold: 12,
        wood: 5,
        difficulty: 0,
        upgrades: {},
        overworld: {
            hexes: new Map([
                ['0,0', { hex: new Hex(0, 0, 0), type: 'mine' }],
                ['1,0', { hex: new Hex(1, 0, -1), type: 'shrine', owner: 'player' }],
                ['1,-1', { hex: new Hex(1, -1, 0), type: 'ruin' }]
            ])
        },
        stats: {},
        imperialFavor: 4
    };
    const exoticSave = Persistence.saveSnapshot(exoticGame, 9);
    assert.strictEqual(exoticSave.payload.overworld.hexes.length, 3, 'new tile ids should serialize');

    const exoticReload = Persistence.loadSnapshot(9, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.ok(exoticReload.state);
    assert.strictEqual(exoticReload.state.overworld.hexes.size, 3);
    const exoticTypes = Array.from(exoticReload.state.overworld.hexes.values()).map(t => t.type).sort();
    assert.deepStrictEqual(exoticTypes, ['mine', 'ruin', 'shrine']);
    const exoticIncome = calcIncome(exoticReload.state.overworld.hexes);
    assert.deepStrictEqual(exoticIncome, { gold: 4, wood: 0 }, 'income should honor saved mine/ruin data');

    // Storage errors should be reported without crashing gameplay flows
    const failingAdapter = Persistence.createStorageAdapter({
        getItem: () => null,
        setItem: () => {
            const err = new Error('Quota exceeded');
            err.name = 'QuotaExceededError';
            throw err;
        },
        removeItem: () => {},
        keys: () => []
    });
    Persistence.setStorageAdapter(failingAdapter);

    const failureSave = Persistence.saveSnapshot(saveGame, 'quota');
    assert.strictEqual(failureSave.success, false, 'failing adapters should return a failure status');
    assert.strictEqual(failureSave.error, 'quota-exceeded', 'quota errors should be labeled for UI messaging');
    assert.ok(failureSave.payload.stats.lastSaveISO, 'even failed saves should timestamp the payload for status displays');

    // Reset adapter so downstream tests exercise the standard in-memory store
    Persistence.setStorageAdapter(Persistence.createStorageAdapter(global.localStorage));

    // Remote/alternate storage adapter swap
    const remoteStore = new Map();
    const remoteAdapter = Persistence.createStorageAdapter({
        getItem: key => remoteStore.get(key) || null,
        setItem: (key, value) => remoteStore.set(key, value),
        removeItem: key => remoteStore.delete(key),
        keys: () => Array.from(remoteStore.keys())
    });
    Persistence.setStorageAdapter(remoteAdapter);

    const remoteGame = {
        gold: 33,
        wood: 12,
        difficulty: 1,
        imperialFavor: 6,
        upgrades: {},
        overworld: { hexes: new Map([['0,0', { hex: new Hex(0, 0, 0), type: 'castle' }]]) },
        stats: { totalKills: 2 }
    };

    Persistence.saveSnapshot(remoteGame, 'cloud');
    const remoteKey = Persistence.storageKeyForSlot('cloud');
    assert.ok(remoteStore.has(remoteKey), 'remote adapter should receive serialized payloads');

    const remoteLoad = Persistence.loadSnapshot('cloud', { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.strictEqual(remoteLoad.state.gold, remoteGame.gold);
    assert.strictEqual(remoteLoad.stats.totalKills, 2);
    const serializerSnap = Persistence.SnapshotSerializer.serialize(remoteGame);
    assert.strictEqual(serializerSnap.imperialFavor, 6, 'pure serializer should remain accessible');

    // Reset adapter to default localStorage wrapper for any downstream consumers
    Persistence.setStorageAdapter(Persistence.createStorageAdapter(global.localStorage));

    console.log('All persistence tests passed.');
}

await runTests();
