const assert = require('assert');
const { armAmbientLoop, haltAmbientLoop, syncAmbientForState } = require('../scripts/gameAudioHooks.js');

function testArmAmbientLoopPrimesTerritoryPlaylist() {
    const calls = [];
    const ambientStub = {
        enterMode: (mode) => calls.push(['enterMode', mode]),
        start: () => calls.push(['start'])
    };

    armAmbientLoop({ AmbientSoundscape: ambientStub });

    assert.deepStrictEqual(calls[0], ['enterMode', 'TERRITORY'], 'should enter territory mode first');
    assert.deepStrictEqual(calls[1], ['start'], 'should immediately kick off scheduling');
}

function testArmAmbientLoopStartsSharedAudioBed() {
    const calls = [];
    const ambientStub = {
        enterMode: () => {},
        start: () => {}
    };
    const gameAudioStub = {
        startAmbientLoop: () => calls.push('startAmbientLoop')
    };

    armAmbientLoop({ AmbientSoundscape: ambientStub, GameAudio: gameAudioStub });

    assert.deepStrictEqual(calls, ['startAmbientLoop'], 'should start the shared ambient loop once when armed');
}

function testHaltAmbientLoopStopsAllTracks() {
    const calls = [];
    const windowStub = {
        Game: { ambientLoopStarted: true },
        GameAudio: {
            ambientKey: 'ambient',
            stop: (key) => calls.push(['stop', key])
        },
        AmbientSoundscape: { stopAll: () => calls.push(['stopAll']) },
        AudioDebugBus: { reportAmbientState: (state) => calls.push(['state', state]) }
    };

    haltAmbientLoop(windowStub);

    assert.strictEqual(windowStub.Game.ambientLoopStarted, false, 'flag should be cleared when halting');
    assert.deepStrictEqual(calls[0], ['stop', 'ambient'], 'ambient track should stop first');
    assert.deepStrictEqual(calls[1], ['stop', undefined], 'fallback stop without key should also run');
    assert.deepStrictEqual(calls[2], ['stopAll'], 'ambient conductor should be stopped');
    assert.deepStrictEqual(calls[3], ['state', 'HALTED'], 'debug bus should receive halted state');
}

function testSyncAmbientForCombatClearsLoopBeforeStinger() {
    const calls = [];
    const windowStub = {
        Game: { ambientLoopStarted: true },
        GameAudio: { ambientKey: 'ambient', stop: (key) => calls.push(['stop', key]) },
        AmbientSoundscape: { stopAll: () => calls.push(['stopAll']) },
        AudioDebugBus: { reportAmbientState: (state) => calls.push(['state', state]) },
        enterCombat: () => calls.push(['enterCombat'])
    };

    syncAmbientForState('COMBAT', {}, windowStub);

    assert.strictEqual(windowStub.Game.ambientLoopStarted, false, 'halt should clear the armed flag before combat');
    assert.ok(calls.find(entry => entry[0] === 'stopAll'), 'ambient conductor should be stopped before war mode');
    const enterIndex = calls.findIndex(entry => entry[0] === 'enterCombat');
    const stopIndex = calls.findIndex(entry => entry[0] === 'stopAll');
    assert.ok(enterIndex > stopIndex, 'combat stinger should fire after ambience is halted');
    assert.ok(calls.filter(entry => entry[0] === 'enterCombat').length === 1, 'combat entry point should only run once');
}

function testSyncAmbientReturnsToOverworldCleanly() {
    const calls = [];
    const windowStub = {
        Game: { ambientLoopStarted: false },
        GameAudio: { startAmbientLoop: () => calls.push(['startAmbientLoop']) },
        AmbientSoundscape: { stopAll: () => calls.push(['stopAll']) },
        AudioDebugBus: { reportAmbientState: (state) => calls.push(['state', state]) },
        exitCombat: (result) => calls.push(['exitCombat', result])
    };

    syncAmbientForState('OVERWORLD', { outcome: 'victory' }, windowStub);

    assert.strictEqual(windowStub.Game.ambientLoopStarted, true, 'ambient loop should be marked as running after resync');
    assert.deepStrictEqual(calls.find(entry => entry[0] === 'exitCombat'), ['exitCombat', 'victory'], 'combat exit should receive outcome');
    assert.ok(calls.find(entry => entry[0] === 'startAmbientLoop'), 'overworld ambient loop should restart');
    const states = calls.filter(entry => entry[0] === 'state').map(entry => entry[1]);
    assert.ok(states.includes('HALTED') && states.includes('OVERWORLD'), 'debug bus should see both halted and overworld states');
}

function run() {
    testArmAmbientLoopPrimesTerritoryPlaylist();
    testArmAmbientLoopStartsSharedAudioBed();
    testHaltAmbientLoopStopsAllTracks();
    testSyncAmbientForCombatClearsLoopBeforeStinger();
    testSyncAmbientReturnsToOverworldCleanly();
    console.log('All game ambient loop tests passed.');
}

run();
