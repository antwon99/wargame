import assert from 'assert';
import { createGameCore } from '../scripts/game/core.js';

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

function run() {
    testResetProgressWithoutWindow();
    console.log('resetProgress tests passed.');
}

run();
