import assert from 'assert';
import { createGameCore } from '../scripts/game/core.js';

function buildGame() {
    const { Game } = createGameCore({
        dependencies: {
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

    return Game;
}

function testPreserveIntroSkipsReset() {
    const originalDocument = globalThis.document;
    globalThis.document = {};
    try {
        const Game = buildGame();
        const calls = { clear: 0, reset: 0 };
        Game.introOverlay = {
            clearIntroSeenFlag: () => { calls.clear += 1; },
            reset: () => { calls.reset += 1; },
            active: true
        };

        Game.bootstrapNewWorld({ preserveIntro: true });

        assert.strictEqual(calls.clear, 0, 'preserveIntro should not clear intro seen flag');
        assert.strictEqual(calls.reset, 0, 'preserveIntro should not reset the intro overlay');
        assert.strictEqual(Game.shouldRunImperialIntro, false, 'preserveIntro should skip re-arming the intro overlay');
    } finally {
        if (typeof originalDocument === 'undefined') {
            delete globalThis.document;
        } else {
            globalThis.document = originalDocument;
        }
    }
}

function testDefaultBootstrapResetsIntro() {
    const originalDocument = globalThis.document;
    globalThis.document = {};
    try {
        const Game = buildGame();
        const calls = { clear: 0, reset: 0 };
        Game.introOverlay = {
            clearIntroSeenFlag: () => { calls.clear += 1; },
            reset: () => { calls.reset += 1; },
            active: true
        };

        Game.bootstrapNewWorld();

        assert.strictEqual(calls.clear, 0, 'bootstrapNewWorld should preserve intro seen flag by default');
        assert.strictEqual(calls.reset, 0, 'bootstrapNewWorld should preserve the intro overlay by default');
        assert.strictEqual(Game.shouldRunImperialIntro, false, 'default bootstrap should not arm the intro overlay');
    } finally {
        if (typeof originalDocument === 'undefined') {
            delete globalThis.document;
        } else {
            globalThis.document = originalDocument;
        }
    }
}

function testExplicitBootstrapResetsIntro() {
    const originalDocument = globalThis.document;
    globalThis.document = {};
    try {
        const Game = buildGame();
        const calls = { clear: 0, reset: 0 };
        Game.introOverlay = {
            clearIntroSeenFlag: () => { calls.clear += 1; },
            reset: () => { calls.reset += 1; },
            active: true
        };

        Game.bootstrapNewWorld({ preserveIntro: false });

        assert.strictEqual(calls.clear, 1, 'explicit reset should clear intro seen flag');
        assert.strictEqual(calls.reset, 1, 'explicit reset should reset the intro overlay');
        assert.strictEqual(Game.shouldRunImperialIntro, true, 'explicit reset should arm the intro overlay');
    } finally {
        if (typeof originalDocument === 'undefined') {
            delete globalThis.document;
        } else {
            globalThis.document = originalDocument;
        }
    }
}

function run() {
    testPreserveIntroSkipsReset();
    testDefaultBootstrapResetsIntro();
    testExplicitBootstrapResetsIntro();
    console.log('bootstrapNewWorld intro preservation tests passed.');
}

run();
