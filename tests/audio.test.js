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
            pauseCalls: 0,
            listeners: {},
            play() { this.playCount++; return Promise.resolve(); },
            pause() { this.paused = true; this.pauseCalls++; },
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

function createManualScheduler() {
    return {
        timeouts: [],
        intervals: [],
        setTimeout(fn) { this.timeouts.push(fn); return this.timeouts.length - 1; },
        clearTimeout(id) { this.timeouts[id] = null; },
        setInterval(fn) { this.intervals.push(fn); return this.intervals.length - 1; },
        clearInterval(id) { this.intervals[id] = null; }
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

function testConductorLimitsOverlapAndCrossfades() {
    const log = [];
    const scheduler = createManualScheduler();
    const manager = new AudioManager({
        territory: { src: 'territory', cooldownMs: 0 },
        war: { src: 'war', cooldownMs: 0 }
    }, { createAudio: createStubFactory(log) });

    const conductor = new AmbientConductor(manager, {
        initialMode: 'TERRITORY',
        random: () => 0.01,
        maxOverlapMs: 10000,
        scheduler,
        states: {
            TERRITORY: {
                tracks: [{ key: 'territory', fadeMs: 15000, startVolume: 0, volume: 0.6 }],
                silenceRangeMs: [0, 0],
                fadeMs: 15000,
                overlapMs: 15000,
                crossfadeChance: 0,
                maxTrackMs: 20
            }
        }
    });

    conductor.playNextNow();
    assert.strictEqual(conductor.activeHandle.fadeMs, 10000, 'fade duration should cap at maxOverlapMs');

    // Launch another track immediately to force a crossfade while the first is active.
    conductor.states.TERRITORY.tracks = [{ key: 'war', fadeMs: 15000, startVolume: 0, volume: 0.6 }];
    conductor.playNextNow();

    // Exhaust fade intervals so both tracks complete their fades.
    for (let i = 0; i < 200; i += 1) {
        scheduler.intervals.forEach((fn) => { if (typeof fn === 'function') fn(); });
    }

    const firstNode = log.find((n) => n.src === 'territory');
    const secondNode = log.find((n) => n.src === 'war');

    assert.ok(firstNode.paused, 'previous track should be paused after fade out');
    assert.ok(firstNode.pauseCalls >= 1, 'fade-out should explicitly pause the previous track');
    assert.strictEqual(conductor.activeHandle.node, secondNode, 'new track should own the active handle');
}

function testStopCurrentPreservesActiveHandleIdentity() {
    const log = [];
    const scheduler = createManualScheduler();
    const manager = new AudioManager({
        territory: { src: 'territory', cooldownMs: 0 },
        war: { src: 'war', cooldownMs: 0 }
    }, { createAudio: createStubFactory(log) });

    const conductor = new AmbientConductor(manager, {
        initialMode: 'TERRITORY',
        random: () => 0.2,
        maxOverlapMs: 500,
        scheduler,
        states: {
            TERRITORY: {
                tracks: [{ key: 'territory', fadeMs: 300, startVolume: 0.2, volume: 0.6 }],
                silenceRangeMs: [0, 0],
                fadeMs: 300,
                overlapMs: 300,
                crossfadeChance: 0,
                maxTrackMs: 5000,
                volume: 0.6
            },
            WAR: {
                tracks: [{ key: 'war', fadeMs: 300, startVolume: 0.2, volume: 0.65 }],
                silenceRangeMs: [0, 0],
                fadeMs: 300,
                overlapMs: 300,
                crossfadeChance: 0,
                maxTrackMs: 5000,
                volume: 0.65
            }
        }
    });

    const flushFades = (ticks = 20) => {
        for (let i = 0; i < ticks; i += 1) {
            scheduler.intervals.forEach((fn) => { if (typeof fn === 'function') fn(); });
        }
    };

    conductor.playNextNow();
    const firstNode = log[0];

    conductor.active = false;
    conductor.enterMode('WAR');
    conductor.playNextNow();

    flushFades();
    const aliveAfterWar = log.filter((n) => !n.paused);
    assert.strictEqual(conductor.activeHandle.node, log[1], 'war track should remain active after territory fade-out');
    assert.strictEqual(aliveAfterWar.length, 1, 'only one node should remain active after fading territory');
    assert.ok(firstNode.paused, 'territory track should be paused after its fade');

    conductor.active = false;
    conductor.enterMode('TERRITORY');
    conductor.playNextNow();

    flushFades();
    const aliveAfterTerritory = log.filter((n) => !n.paused);
    assert.strictEqual(conductor.activeHandle.node, log[2], 'territory track should remain active after war fade-out');
    assert.strictEqual(aliveAfterTerritory.length, 1, 'only one node should remain active after fading war');
}

function run() {
    testCooldownPreventsSpam();
    testOverlapCreatesClone();
    testAmbientLoop();
    testWeightedSelectionUsesRandomizer();
    testAmbientConductorModes();
    testConductorLimitsOverlapAndCrossfades();
    testStopCurrentPreservesActiveHandleIdentity();
    testManifestIncludesNewEffects();
    console.log('All audio tests passed.');
}

run();
