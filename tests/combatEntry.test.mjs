import assert from 'assert';
import { beginCombatFromTile } from '../scripts/game/combatEntry.js';
import { TutorialHandler } from '../scripts/tutorialHandler.js';

function createHex(key) {
    return { toString: () => key };
}

function createGame() {
    const game = {
        state: 'OVERWORLD',
        overworld: { hexes: new Map() },
        pendingClearTile: null,
        pendingClearTileKey: null,
        pendingClearTileWasRebel: null,
        started: 0,
        startWar: () => {
            game.started += 1;
        },
        logBootstrapWarning: () => {}
    };
    return game;
}

function run() {
    const tutorialGame = createGame();
    const tutorialTile = { hex: createHex('1,1'), type: 'plain', owner: 'player' };
    tutorialGame.overworld.hexes.set('1,1', tutorialTile);
    TutorialHandler.markFrontierSweepCamp(tutorialGame, tutorialTile, { source: 'test' });

    const tutorialStarted = beginCombatFromTile(tutorialGame, tutorialTile);

    assert.strictEqual(tutorialStarted, true, 'tutorial combat should start in overworld');
    assert.strictEqual(tutorialGame.pendingClearTile, tutorialTile, 'tutorial target should be set as pending clear tile');
    assert.strictEqual(tutorialGame.pendingClearTileKey, '1,1', 'tutorial target key should be stored');
    assert.strictEqual(tutorialGame.pendingClearTileWasRebel, true, 'tutorial camp should be marked as rebel');

    const rebelGame = createGame();
    const rebelTile = { hex: createHex('2,2'), type: 'rebelcamp', owner: 'rebel' };
    rebelGame.overworld.hexes.set('2,2', rebelTile);

    beginCombatFromTile(rebelGame, rebelTile);

    assert.strictEqual(rebelGame.pendingClearTileWasRebel, true, 'rebel camp targets should be flagged as rebel');

    const hostileGame = createGame();
    const hostileTile = { hex: createHex('3,3'), type: 'forest', owner: 'enemy' };
    hostileGame.overworld.hexes.set('3,3', hostileTile);
    hostileGame.state = 'COMBAT';

    const blocked = beginCombatFromTile(hostileGame, hostileTile);

    assert.strictEqual(blocked, false, 'combat should not begin outside overworld');
    assert.strictEqual(hostileGame.started, 0, 'combat should not start when state is blocked');
    assert.strictEqual(hostileGame.pendingClearTile, null, 'pending clear tile should remain unset when blocked');

    hostileGame.state = 'OVERWORLD';
    const resumed = beginCombatFromTile(hostileGame, hostileTile);

    assert.strictEqual(resumed, true, 'combat should begin in overworld');
    assert.strictEqual(hostileGame.pendingClearTileWasRebel, false, 'enemy tiles should not be marked as rebel');
    assert.strictEqual(hostileGame.started, 1, 'combat should start exactly once after state correction');

    console.log('Combat entry tests passed.');
}

run();
