const assert = require('assert');
const { AudioManager } = require('../audio.js');

function createStubFactory(log) {
    return (src) => {
        const node = {
            src,
            loop: false,
            currentTime: 0,
            volume: 1,
            playCount: 0,
            paused: false,
            play() { this.playCount++; return Promise.resolve(); },
            pause() { this.paused = true; },
            cloneNode() {
                const clone = createStubFactory(log)(src);
                clone.isClone = true;
                return clone;
            }
        };
        log.push(node);
        return node;
    };
}

function testCooldownPreventsSpam() {
    const log = [];
    const manager = new AudioManager({ ping: { src: 'ping', cooldownMs: 200 } }, { createAudio: createStubFactory(log) });
    assert.ok(manager.play('ping'));
    const firstNode = log[0];
    assert.strictEqual(firstNode.playCount, 1, 'first play should increment counter');
    assert.strictEqual(manager.play('ping'), false, 'cooldown should block immediate replay');
    assert.strictEqual(firstNode.playCount, 1, 'cooldown should not trigger another play');
    manager.lastPlayed.set('ping', Date.now() - 500);
    assert.ok(manager.play('ping'), 'cooldown should expire');
    assert.strictEqual(firstNode.playCount, 2, 'play should reuse base node after cooldown');
}

function testOverlapCreatesClone() {
    const log = [];
    const manager = new AudioManager({ sword: { src: 'sword', allowOverlap: true } }, { createAudio: createStubFactory(log) });
    manager.play('sword');
    manager.play('sword');
    assert.strictEqual(log.length, 2, 'second call should clone base node for overlap');
    assert.strictEqual(log[0].playCount, 1);
    assert.strictEqual(log[1].playCount, 1);
    assert.ok(log[1].isClone, 'overlap playback should rely on a cloned node');
}

function testAmbientLoop() {
    const log = [];
    const manager = new AudioManager({ ambient: { src: 'ambient', loop: true, isAmbient: true } }, { createAudio: createStubFactory(log) });
    assert.ok(manager.startAmbientLoop(), 'ambient loop should start even when called repeatedly');
    const ambient = log[0];
    assert.strictEqual(ambient.loop, true, 'ambient should be forced into a loop');
    assert.strictEqual(ambient.playCount, 1, 'ambient loop should play once per start');
    manager.stop();
    assert.strictEqual(ambient.currentTime, 0, 'stop should reset playback position');
}

function run() {
    testCooldownPreventsSpam();
    testOverlapCreatesClone();
    testAmbientLoop();
    console.log('All audio tests passed.');
}

run();
