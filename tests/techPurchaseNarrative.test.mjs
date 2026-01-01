import assert from 'assert';
import { createGameCore } from '../scripts/game/core.js';

function buildGame() {
    const { Game } = createGameCore({
        buildClusterBonusMap: () => new Map(),
        buildTileVisibilityMap: () => new Map()
    });

    Game.spawnTxt = () => {};
    Game.updateHUD = () => {};
    Game.updateResearchUI = () => {};
    Game.refreshClusterBonuses = () => {};
    Game.narrativeEvents = [];
    Game.narrative = {
        emit: (eventType, payload) => {
            Game.narrativeEvents.push({ eventType, payload });
        }
    };
    Game.research = Game.buildResearchState();
    Game.updateResearchBonuses();
    Game.gold = 1000;
    Game.wood = 200;

    return Game;
}

function testTechPurchaseNarrative() {
    const game = buildGame();

    game.buyTechnology('lumberjacks');

    const event = game.narrativeEvents.find((entry) => entry.eventType === 'tech_purchased');
    assert.ok(event, 'tech purchases should emit narrative events');
    assert.strictEqual(event.payload?.techId, 'lumberjacks', 'payload should include the tech id');
    assert.strictEqual(event.payload?.cost?.gold, 400, 'payload should include the gold cost');
    assert.strictEqual(event.payload?.goldDelta, -400, 'payload should include the gold delta');
    assert.strictEqual(event.payload?.woodDelta, 0, 'payload should include the wood delta');
}

function run() {
    testTechPurchaseNarrative();
    console.log('Tech purchase narrative tests passed.');
}

run();
