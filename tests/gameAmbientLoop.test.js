const assert = require('assert');
const { armAmbientLoop, haltAmbientLoop } = require('../scripts/gameAudioHooks.js');

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
    let stopped = false;
    const ambientStub = { stopAll: () => { stopped = true; } };

    haltAmbientLoop({ AmbientSoundscape: ambientStub });

    assert.ok(stopped, 'stopAll should be invoked to silence active ambience');
}

function run() {
    testArmAmbientLoopPrimesTerritoryPlaylist();
    testArmAmbientLoopStartsSharedAudioBed();
    testHaltAmbientLoopStopsAllTracks();
    console.log('All game ambient loop tests passed.');
}

run();
