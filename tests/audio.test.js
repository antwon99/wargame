const assert = require('assert');
const { AudioManager, SFX_MANIFEST, AmbientConductor } = require('../audio.js');

function createStubFactory(log) {
    return (src) => {
        const node = {
            src,
            loop: false,
            currentTime: 0,
            volume: 1,
            playCount: 0,
            paused: false,
            listeners: {},
            play() { this.playCount++; return Promise.resolve(); },
            pause() { this.paused = true; },
            addEventListener(event, fn) { this.listeners[event] = fn; },
            cloneNode() {
                const clone = createStubFactory(log)(src);
                clone.isClone = true;
                return clone;
            },
            trigger(event) {
                if (typeof this.listeners[event] === 'function') this.listeners[event]();
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

function testManifestIncludesNewEffects() {
    assert.ok(SFX_MANIFEST.victory, 'victory sound should be mapped');
    assert.ok(SFX_MANIFEST.rare?.variations?.length >= 3, 'rare sound should include weighted variations');
    assert.ok(SFX_MANIFEST.tower?.variations?.length >= 3, 'tower/castle sound should include variations');
    assert.ok(SFX_MANIFEST.ambiance_dark, 'war ambience track should be mapped');
    assert.ok(SFX_MANIFEST.ambiance_upbeat, 'territory ambience track should be mapped');
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

function testWeightedSelectionUsesRandomizer() {
    const log = [];
    const picks = [0.99, 0.01];
    const manager = new AudioManager({
        arrow: {
            cooldownMs: 0,
            allowOverlap: true,
            variations: [
                { src: 'light', weight: 1 },
                { src: 'heavy', weight: 3 }
            ]
        }
    }, { createAudio: createStubFactory(log), random: () => picks.shift() });

    manager.play('arrow');
    manager.play('arrow');
    assert.strictEqual(log[0].src, 'heavy', 'first roll should pick heavier weight');
    assert.strictEqual(log[1].src, 'light', 'second roll should pick lighter weight');
}

function testAmbientConductorModes() {
    const log = [];
    const manager = new AudioManager({
        territory: { src: 'a', cooldownMs: 0 },
        war: { src: 'b', cooldownMs: 0 }
    }, { createAudio: createStubFactory(log) });

    const conductor = new AmbientConductor(manager, {
        initialMode: 'TERRITORY',
        random: () => 0.1,
        scheduler: {
            pending: [],
            setTimeout: function (fn) { this.pending.push(fn); return this.pending.length; },
            clearTimeout: () => {},
            setInterval: () => 0,
            clearInterval: () => {}
        },
        states: {
            TERRITORY: {
                tracks: [{ key: 'territory', weight: 1 }],
                silenceRangeMs: [0, 0],
                fadeMs: 0,
                overlapMs: 0,
                crossfadeChance: 0,
                maxTrackMs: 10
            },
            WAR: {
                tracks: [{ key: 'war', weight: 1 }],
                silenceRangeMs: [0, 0],
                fadeMs: 0,
                overlapMs: 0,
                crossfadeChance: 0,
                maxTrackMs: 10
            }
        }
    });

    conductor.playNextNow();
    assert.strictEqual(log[0].src, 'a', 'territory mode should play territory track');
    conductor.enterMode('WAR');
    conductor.playNextNow();
    assert.ok(log.find((n) => n.src === 'b'), 'war mode should swap playlist');
}

function run() {
    testCooldownPreventsSpam();
    testOverlapCreatesClone();
    testAmbientLoop();
    testWeightedSelectionUsesRandomizer();
    testAmbientConductorModes();
    testManifestIncludesNewEffects();
    console.log('All audio tests passed.');
}

run();
