import assert from 'assert';
import { createGameCore } from '../scripts/game/core.js';
import { TutorialHandler } from '../scripts/tutorialHandler.js';

function testResetProgressWithoutWindow() {
    const persistence = {
        DEFAULT_STATS: { bestLevel: 0, bestKills: 0, totalKills: 0, warsWon: 0, warsFought: 0, lastOutcome: 'N/A', lastSaveISO: null },
        cleared: false,
        clearSnapshot() {
            this.cleared = true;
        }
    };

    const { Game } = createGameCore({ dependencies: { persistence } });
    Game.persistenceAvailable = true;
    let bootstrapArgs = null;
    Game.bootstrapNewWorld = (options) => {
        bootstrapArgs = options;
    };
    Game.updateLeaderboardUI = () => {};
    Game.updateHUD = () => {};
    Game.updateUpgradeMenu = () => {};
    Game.updateSaveSlotsUI = () => {};
    Game.toggleSidebar = () => {};
    Game.spawnTxt = () => {};

    const previousWindow = global.window;
    try {
        // Ensure no global window exists to mirror a headless environment.
        // eslint-disable-next-line no-undef
        delete global.window;
        assert.doesNotThrow(() => Game.resetProgress(), 'resetProgress should not throw without a window global');
    } finally {
        if (previousWindow !== undefined) {
            global.window = previousWindow;
        }
    }

    assert.strictEqual(persistence.cleared, true, 'persistence module should be cleared');
    assert.strictEqual(Game.activeSaveSlot, '1', 'reset should restore the active save slot to default');
    assert.deepStrictEqual(
        bootstrapArgs,
        { preserveIntro: false },
        'resetProgress should explicitly reset the intro overlay'
    );
}

function buildResetGame(persistence) {
    const { Game } = createGameCore({
        dependencies: {
            persistence,
            inputHelpers: { SQRT3: Math.sqrt(3), Layout: {} }
        }
    });

    Game.addOverworldHex = () => {};
    Game.claimHexLogic = () => {};
    Game.calcOverworldGhosts = () => {};
    Game.finalizeStarterTerritory = () => {};
    Game.syncReclamationAwaitState = () => {};
    Game.updateResearchBonuses = () => {};
    Game.updateSaveStatus = () => {};
    Game.showOverworldUI = () => {};
    Game.issueImperialIntroMandate = () => {};
    Game.buildResearchState = () => ({ technologies: [], bonuses: {}, lives: 0 });
    Game.updateLeaderboardUI = () => {};
    Game.updateHUD = () => {};
    Game.updateUpgradeMenu = () => {};
    Game.updateSaveSlotsUI = () => {};
    Game.toggleSidebar = () => {};
    Game.spawnTxt = () => {};
    Game.introOverlay = { reset: () => {}, clearIntroSeenFlag: () => {}, active: true };

    return Game;
}

function testResetProgressSeedsFreshFrontierCamp() {
    const persistence = {
        DEFAULT_STATS: { bestLevel: 0, bestKills: 0, totalKills: 0, warsWon: 0, warsFought: 0, lastOutcome: 'N/A', lastSaveISO: null },
        cleared: false,
        clearSnapshot() {
            this.cleared = true;
        }
    };

    const Game = buildResetGame(persistence);
    Game.persistenceAvailable = true;
    Game.tutorial = {
        frontierSweep: {
            targetTileKey: 'stale-key',
            completionTick: 42,
            issuedTick: 12,
            source: 'legacy',
            enemyLevel: 2,
            spreadImmune: false
        }
    };

    Game.resetProgress();

    const tutorialState = TutorialHandler.getFrontierSweepState(Game);
    assert.ok(tutorialState.targetTileKey, 'reset should seed a new tutorial camp key');
    assert.notStrictEqual(
        tutorialState.targetTileKey,
        'stale-key',
        'reset should replace the previous tutorial camp key'
    );
    assert.strictEqual(tutorialState.completionTick, null, 'reset should clear the previous completion tick');
    assert.strictEqual(
        Game.overworld.hexes.has(tutorialState.targetTileKey),
        true,
        'reset should create a camp matching the tracked tutorial key'
    );
}

function run() {
    testResetProgressWithoutWindow();
    testResetProgressSeedsFreshFrontierCamp();
    console.log('resetProgress tests passed.');
}

run();
