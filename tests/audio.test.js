import assert from 'assert';
import { initImperialMandates } from '../scripts/mandates/imperialMandates.js';
import { AudioDebugBus } from '../scripts/audio/debugBus.js';

let AudioManager;
let SFX_GROUPS;
let SFX_MANIFEST;
let AmbientConductor;
let AmbientScheduler;
let AmbientRandomizer;
let enterCombat;
let exitCombat;
let attachCombatStingerGuards;
let initAudio;

async function loadAudioModule() {
    const audioModule = await import('../scripts/audio.js');
    ({
        AudioManager,
        SFX_GROUPS,
        SFX_MANIFEST,
        AmbientConductor,
        AmbientScheduler,
        AmbientRandomizer,
        enterCombat,
        exitCombat,
        attachCombatStingerGuards,
        initAudio
    } = audioModule);

    if (typeof initAudio === 'function') {
        initAudio();
    }
}

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
            play() { this.paused = false; this.playCount++; return Promise.resolve(); },
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

function createSequenceRandom(...values) {
    let idx = 0;
    return () => {
        const value = values[idx % values.length];
        idx += 1;
        return value;
    };
}

function flushPromises() {
    return new Promise((resolve) => setImmediate(resolve));
}

function testAmbientRandomizerUsesFairWeightsAndDelays() {
    const randomizer = new AmbientRandomizer(() => 0.3, {
        initialDelayRangeMs: [100, 200],
        minSilenceMs: 10,
        maxSilenceMs: 30
    });

    const track = randomizer.pickTrack('TEST', [
        { key: 'light', weight: 1 },
        { key: 'heavy', weight: 3 }
    ]);
    assert.strictEqual(track.key, 'light', 'randomizer should treat all tracks equally regardless of provided weights');
    assert.strictEqual(randomizer.randomInitialDelay(), 130, 'initial delay should honor provided defaults');
    assert.strictEqual(randomizer.randomSilence({ silenceRangeMs: [10, 30] }), 16, 'silence window should derive from RNG');
}

function testAmbientRandomizerAvoidsImmediateRepeats() {
    const randomizer = new AmbientRandomizer(createSequenceRandom(0.1, 0.1, 0.1), {
        minSilenceMs: 5,
        maxSilenceMs: 10
    });

    const tracks = [
        { key: 'one', weight: 1 },
        { key: 'two', weight: 1 },
        { key: 'three', weight: 1 }
    ];

    const first = randomizer.pickTrack('ROTATION', tracks);
    const second = randomizer.pickTrack('ROTATION', tracks);
    const third = randomizer.pickTrack('ROTATION', tracks);

    assert.notStrictEqual(first.key, second.key, 'ambient randomizer should not repeat tracks back-to-back');
    assert.notStrictEqual(second.key, third.key, 'subsequent picks should also avoid immediate repeats');
}

function testAmbientSchedulerClearsAllTrackedTimers() {
    const backend = createManualScheduler();
    const scheduler = new AmbientScheduler(backend);
    const node = { id: 'fade-node' };

    scheduler.scheduleNext(() => {}, 10);
    scheduler.scheduleFallback(() => {}, 20);
    scheduler.scheduleFade(node, 5, () => {});

    assert.ok(backend.timeouts.filter(Boolean).length >= 2, 'scheduler should store scheduled timeouts');
    assert.ok(backend.intervals.filter(Boolean).length >= 1, 'scheduler should store fade intervals');

    scheduler.clearAll();
    assert.ok(backend.timeouts.every((t) => t === null), 'clearAll should clear timeouts');
    assert.ok(backend.intervals.every((i) => i === null), 'clearAll should clear intervals');
}

function testCooldownPreventsSpam() {
    const log = [];
    const manager = new AudioManager({ ping: { src: 'ping', cooldownMs: 200 } }, { createAudio: createStubFactory(log) });
    assert.ok(manager.play('ping'));
    const firstNode = log[0];
    assert.strictEqual(firstNode.playCount, 1, 'first play should increment counter');
    assert.strictEqual(manager.play('ping'), false, 'cooldown should block immediate replay');
    assert.strictEqual(firstNode.playCount, 1, 'cooldown should not trigger another play');
    manager.lastAttempted.set('ping', Date.now() - 500);
    assert.ok(manager.play('ping'), 'cooldown should expire');
    assert.strictEqual(firstNode.playCount, 2, 'play should reuse base node after cooldown');
}

async function testPlaybackUnlockRetriesBlockedAudio() {
    let allowPlayback = false;
    const nodeLog = [];
    const manager = new AudioManager({ click: { src: 'click', cooldownMs: 200 } }, {
        createAudio: (src) => {
            const node = {
                src,
                loop: false,
                currentTime: 0,
                volume: 1,
                playCount: 0,
                paused: false,
                listeners: {},
                play() {
                    this.playCount += 1;
                    return allowPlayback ? Promise.resolve() : Promise.reject(new Error('Blocked'));
                },
                pause() { this.paused = true; },
                addEventListener(event, fn) { this.listeners[event] = fn; }
            };
            nodeLog.push(node);
            return node;
        }
    });

    assert.ok(manager.play('click'), 'play should attempt even when blocked');
    await flushPromises();
    assert.strictEqual(manager.pendingPlays.size, 1, 'blocked plays should be queued for unlock retries');
    assert.strictEqual(manager.lastPlayed.has('click'), false, 'lastPlayed should not update on blocked play');

    allowPlayback = true;
    const retried = manager.unlock('gesture');
    assert.strictEqual(retried, 1, 'unlock should retry pending plays');
    await flushPromises();
    assert.strictEqual(manager.pendingPlays.size, 0, 'pending plays should clear after successful retry');
    assert.ok(manager.lastPlayed.has('click'), 'lastPlayed should update after successful retry');
    assert.strictEqual(nodeLog[0].playCount, 2, 'retry should trigger another play call');
}

function testManifestIncludesNewEffects() {
    assert.ok(SFX_MANIFEST.victory, 'victory sound should be mapped');
    assert.ok(SFX_MANIFEST.rare?.variations?.length >= 3, 'rare sound should include weighted variations');
    assert.ok(SFX_MANIFEST.death?.variations?.length >= 5, 'death sounds should include weighted variations');
    assert.ok(SFX_MANIFEST.raredeath?.variations?.length >= 5, 'rare death sounds should include weighted variations');
    assert.ok(SFX_MANIFEST.tower?.variations?.length >= 3, 'tower/castle sound should include variations');
    assert.ok(SFX_MANIFEST.ambiance_dark, 'war ambience track should be mapped');
    assert.ok(SFX_MANIFEST.ambiance_upbeat, 'territory ambience track should be mapped');
    assert.ok(SFX_MANIFEST.ambiance_anger, 'war ambience additions should be mapped');
    assert.ok(SFX_MANIFEST.ambiance_uptake, 'territory ambience additions should be mapped');
    assert.ok(SFX_MANIFEST.mine, 'mine territory sound should be mapped');
    assert.ok(SFX_MANIFEST.shrine, 'shrine territory sound should be mapped');
    assert.ok(SFX_MANIFEST.ruin, 'ruin territory sound should be mapped');
    assert.ok(
        SFX_MANIFEST.rare?.variations?.every((v) => v.src.includes('sfx/combat/rare/')),
        'rare sounds should live under combat audio'
    );
    assert.ok(
        SFX_MANIFEST.death?.variations?.every((v) => v.src.includes('sfx/combat/deaths/death/')),
        'death sounds should live under combat audio'
    );
    assert.ok(
        SFX_MANIFEST.raredeath?.variations?.every((v) => v.src.includes('sfx/combat/deaths/raredeath/')),
        'rare death sounds should live under combat audio'
    );
    assert.ok(!SFX_MANIFEST.ambient_bed_wind, 'wind bed intentionally disabled to avoid doubling ambience');
}

function testGroupedPlaybackCoalescesBursts() {
    const log = [];
    const reportCalls = [];
    const originalReportGrouped = AudioDebugBus.reportGroupedPlayback;
    AudioDebugBus.reportGroupedPlayback = (entry) => {
        reportCalls.push(entry);
    };
    const manager = new AudioManager({
        death: {
            src: 'death',
            cooldownMs: 0,
            allowOverlap: true,
            groupKey: 'combat-death',
            groupWindowMs: 200,
            maxGroupPlays: 1
        }
    }, { createAudio: createStubFactory(log) });

    const originalNow = Date.now;
    let now = 1000;
    Date.now = () => now;
    try {
        assert.ok(manager.play('death'), 'first death should play');
        assert.strictEqual(manager.play('death'), false, 'grouping should block bursty repeats');
        now += 250;
        assert.ok(manager.play('death'), 'grouping should reset after the window expires');
    } finally {
        Date.now = originalNow;
        AudioDebugBus.reportGroupedPlayback = originalReportGrouped;
    }

    assert.strictEqual(log.length, 2, 'grouping should only create two playback nodes');
    assert.strictEqual(reportCalls.length, 1, 'grouping should report a blocked burst to the debug bus');
    assert.strictEqual(reportCalls[0].groupKey, 'combat-death', 'debug bus should record the grouping key');
}

function testLiveNodeSnapshotBackfill() {
    const log = [];
    const manager = new AudioManager({ ping: { src: 'ping' } }, { createAudio: createStubFactory(log) });

    manager.play('ping');
    const snapshot = manager.getLiveNodesSnapshot();

    assert.strictEqual(snapshot.length, 1, 'snapshot should include live playback');
    assert.strictEqual(snapshot[0].node, log[0], 'snapshot should include the playback node');
    assert.strictEqual(snapshot[0].key, 'ping', 'snapshot should include manifest key');
    assert.strictEqual(snapshot[0].src, 'ping', 'snapshot should include source');
    assert.strictEqual(snapshot[0].category, 'sfx', 'snapshot should include category');
}

function testSyncDebugBusRegistersExistingNodes() {
    const log = [];
    const manager = new AudioManager({ ping: { src: 'ping' } }, { createAudio: createStubFactory(log) });

    manager.play('ping');
    const calls = [];
    const originalRegister = AudioDebugBus.registerPlayback;
    AudioDebugBus.registerPlayback = (node, meta) => {
        calls.push({ node, meta });
    };

    try {
        const count = manager.syncDebugBus();
        assert.strictEqual(count, 1, 'sync should report one node registered');
        assert.strictEqual(calls.length, 1, 'sync should register a playback node with the debug bus');
        assert.strictEqual(calls[0].node, log[0], 'debug bus should be called with the live node');
        assert.strictEqual(calls[0].meta.key, 'ping', 'debug bus metadata should include the manifest key');
        assert.strictEqual(calls[0].meta.src, 'ping', 'debug bus metadata should include the source');
    } finally {
        AudioDebugBus.registerPlayback = originalRegister;
    }
}
function testTerritoryStartAvoidsLayeringAmbientTwice() {
    const log = [];
    const scheduler = createManualScheduler();
    const manager = new AudioManager({
        ambient: { src: 'ambient', isAmbient: true, loop: true, cooldownMs: 0 },
        territory: { src: 'territory', cooldownMs: 0 }
    }, { createAudio: createStubFactory(log) });

    const conductor = new AmbientConductor(manager, {
        initialMode: 'TERRITORY',
        scheduler,
        random: () => 0.2,
        states: {
            TERRITORY: {
                tracks: [{ key: 'territory', weight: 1, volume: 0.6 }],
                beds: [],
                silenceRangeMs: [1000, 1000],
                fadeMs: 0,
                maxTrackMs: 2000,
                volume: 0.6
            }
        }
    });

    manager.startAmbientLoop();
    conductor.start({ fadeMs: 0 });

    const audible = log.filter((n) => !n.paused);
    assert.strictEqual(audible.length, 1, 'territory start should not layer duplicate ambient sources');
    assert.strictEqual(audible[0].src, 'ambient', 'shared ambient loop should remain the only source until tracks begin');
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

function testAmbientLoopReportsIntent() {
    const log = [];
    const calls = [];
    const originalReportIntent = AudioDebugBus.reportIntent;
    AudioDebugBus.reportIntent = (key) => calls.push(key);
    try {
        const manager = new AudioManager({ ambient: { src: 'ambient', loop: true, isAmbient: true } }, { createAudio: createStubFactory(log) });
        manager.startAmbientLoop();
    } finally {
        AudioDebugBus.reportIntent = originalReportIntent;
    }

    assert.strictEqual(calls.length, 1, 'ambient loop should report its intent once');
    assert.strictEqual(calls[0], 'ambient', 'ambient intent should use the manifest key');
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

function testConductorLimitsFadeDurationsAndStopsOverlap() {
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
    assert.strictEqual(conductor.activeHandle.fadeMs, 10000, 'fade-in should cap at maxOverlapMs even when configured higher');

    // Launch another track immediately; previous one should fade out quickly while the new one fades in.
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
    const aliveAfter = log.filter((n) => !n.paused);
    assert.strictEqual(aliveAfter.length, 1, 'only one ambient node should be audible at a time');
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
    const warNode = log.find((n) => n.src === 'war');
    assert.ok(warNode, 'war track should be created when entering war');
    assert.strictEqual(conductor.activeHandle.node, warNode, 'war track should remain active after territory fade-out');
    assert.strictEqual(aliveAfterWar.length, 1, 'only one node should remain active after fading territory');
    assert.ok(firstNode.paused, 'territory track should be paused after its fade');

    conductor.active = false;
    conductor.enterMode('TERRITORY');
    conductor.playNextNow();

    flushFades();
    const aliveAfterTerritory = log.filter((n) => !n.paused);
    const territoryReturn = log.find((n) => n.src === 'territory' && n.playCount > 1);
    assert.ok(territoryReturn, 'territory track should play again when re-entering');
    assert.strictEqual(conductor.activeHandle.node, territoryReturn, 'territory track should remain active after war fade-out');
    assert.strictEqual(aliveAfterTerritory.length, 1, 'only one node should remain active after fading war');
}

function testModeTransitionsSilencePreviousPlaylist() {
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
                tracks: [{ key: 'territory', fadeMs: 400, startVolume: 0.1, volume: 0.6 }],
                silenceRangeMs: [0, 0],
                fadeMs: 400,
                overlapMs: 400,
                crossfadeChance: 0,
                maxTrackMs: 5000,
                volume: 0.6
            },
            WAR: {
                tracks: [{ key: 'war', fadeMs: 400, startVolume: 0.1, volume: 0.65 }],
                silenceRangeMs: [0, 0],
                fadeMs: 400,
                overlapMs: 400,
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

    const flushTimeouts = () => {
        const pending = [...scheduler.timeouts];
        scheduler.timeouts = scheduler.timeouts.map(() => null);
        pending.forEach((fn) => { if (typeof fn === 'function') fn(); });
    };

    conductor.playNextNow();
    const firstNode = log[0];

    conductor.enterMode('WAR');
    flushTimeouts();
    flushFades();

    const aliveAfterWar = log.filter((n) => !n.paused);
    assert.strictEqual(aliveAfterWar.length, 1, 'war transition should leave only one audible track');
    assert.strictEqual(aliveAfterWar[0].src, 'war', 'war track should remain after transition');
    assert.ok(firstNode.paused, 'territory track should be paused after war transition fades');

    conductor.enterMode('TERRITORY');
    flushTimeouts();
    flushFades();

    const aliveAfterTerritory = log.filter((n) => !n.paused);
    assert.strictEqual(aliveAfterTerritory.length, 1, 'territory transition should leave only one audible track');
    assert.strictEqual(aliveAfterTerritory[0].src, 'territory', 'territory track should remain after transition');
    assert.ok(log[1].paused, 'war track should be paused after territory transition fades');
}

function testAmbientBedsFollowModeChanges() {
    const scheduler = createManualScheduler();
    const log = [];
    const manager = new AudioManager({
        wind: { src: 'wind', loop: true, cooldownMs: 0 },
        horn: { src: 'horn', loop: true, cooldownMs: 0 }
    }, { createAudio: createStubFactory(log) });

    const conductor = new AmbientConductor(manager, {
        initialMode: 'TERRITORY',
        random: () => 0.2,
        scheduler,
        states: {
            TERRITORY: {
                tracks: [],
                beds: [{ key: 'wind', volume: 0.2, fadeMs: 0 }],
                silenceRangeMs: [0, 0],
                fadeMs: 0,
                maxTrackMs: 50
            },
            WAR: {
                tracks: [],
                beds: [{ key: 'horn', volume: 0.3, fadeMs: 0 }],
                silenceRangeMs: [0, 0],
                fadeMs: 0,
                maxTrackMs: 50
            }
        }
    });

    conductor.start({ fadeMs: 0 });
    assert.ok(log.find((n) => n.src === 'wind'), 'wind bed should start with territory mode');

    conductor.enterMode('WAR');
    conductor.start({ fadeMs: 0 });
    const hornNode = log.find((n) => n.src === 'horn');
    assert.ok(hornNode, 'war horn bed should start when entering combat');

    conductor.stopAll();
    assert.ok(log.every((node) => node.paused), 'all bed nodes should pause after stopAll');
}

function testAmbientBedsCanBeDisabled() {
    const log = [];
    const manager = new AudioManager({ wind: { src: 'wind', loop: true, cooldownMs: 0 } }, { createAudio: createStubFactory(log) });
    const conductor = new AmbientConductor(manager, {
        initialMode: 'TERRITORY',
        bedsEnabled: false,
        states: {
            TERRITORY: {
                tracks: [],
                beds: [{ key: 'wind', volume: 0.2, fadeMs: 0 }],
                silenceRangeMs: [0, 0],
                fadeMs: 0,
                maxTrackMs: 10
            }
        }
    });

    conductor.start({ fadeMs: 0 });
    assert.strictEqual(log.length, 0, 'beds should not start when disabled');
}

function testEnterCombatKeepsAmbientAndFiresWardrumImmediately() {
    const log = [];
    const manager = new AudioManager({
        ambient: { src: 'ambient', isAmbient: true, cooldownMs: 0 },
        wardrum: { src: 'wardrum', cooldownMs: 0 }
    }, { createAudio: createStubFactory(log) });

    manager.startAmbientLoop();
    const ambientNode = log[0];

    const conductor = {
        stopCurrentCalls: 0,
        startArgs: null,
        enterModes: [],
        stopCurrent(args) { this.stopCurrentCalls += 1; this.stopArgs = args; },
        clearTimers() { this.cleared = true; },
        enterMode(mode) { this.enterModes.push(mode); },
        start(args) { this.startArgs = args; }
    };

    enterCombat(manager, conductor);

    assert.strictEqual(conductor.stopCurrentCalls, 1, 'current ambience track should be stopped immediately when entering combat');
    assert.strictEqual(conductor.stopArgs.fadeMs, 0, 'combat entry should not wait on long fades');
    assert.deepStrictEqual(conductor.enterModes[0], 'WAR', 'combat entry should switch the playlist to war');
    assert.strictEqual(conductor.startArgs.fadeMs, 0, 'combat start should resume scheduler without a delay');
    assert.ok(log.find((node) => node.src === 'wardrum'), 'wardrum stinger should play instantly');
    const wardrumNode = log.find((node) => node.src === 'wardrum');
    assert.strictEqual(wardrumNode.playCount, 1, 'wardrum should start playing right away');
    assert.strictEqual(ambientNode.paused, false, 'ambient loop should continue playing through combat');
}

function testWardrumStingerDoesNotLoopAfterCombatStart() {
    const log = [];
    const scheduler = createManualScheduler();
    const manager = new AudioManager({
        ambient: { src: 'ambient', isAmbient: true, loop: true, cooldownMs: 0 },
        wardrum: { ...SFX_MANIFEST.wardrum, cooldownMs: 0 },
        war_a: { src: 'war_a', cooldownMs: 0, allowOverlap: true },
        war_b: { src: 'war_b', cooldownMs: 0, allowOverlap: true }
    }, { createAudio: createStubFactory(log), ambientKey: 'ambient' });

    const conductor = new AmbientConductor(manager, {
        initialMode: 'TERRITORY',
        random: () => 0.2,
        scheduler,
        defaults: {
            initialDelayRangeMs: [0, 0],
            minSilenceMs: 0,
            maxSilenceMs: 0,
            fadeInMs: 0,
            fadeOutMs: 0
        },
        states: {
            TERRITORY: {
                tracks: [],
                beds: [],
                silenceRangeMs: [0, 0],
                fadeMs: 0,
                maxTrackMs: 10,
                volume: 0.5
            },
            WAR: {
                tracks: [
                    { key: 'war_a', weight: 1, volume: 0.5 },
                    { key: 'war_b', weight: 1, volume: 0.5 }
                ],
                beds: [],
                silenceRangeMs: [0, 0],
                fadeMs: 0,
                maxTrackMs: 10,
                volume: 0.6
            }
        }
    });

    manager.startAmbientLoop();
    enterCombat(manager, conductor);
    scheduler.timeouts.forEach((fn) => { if (typeof fn === 'function') fn(); });

    const wardrumNodes = log.filter((node) => node.src === SFX_MANIFEST.wardrum.src);
    assert.strictEqual(wardrumNodes.length, 1, 'wardrum stinger should play exactly once on combat start');
    assert.strictEqual(wardrumNodes[0].loop, false, 'wardrum stinger should remain a one-shot');

    const ambientNode = log.find((node) => node.src === 'ambient');
    assert.strictEqual(ambientNode.paused, false, 'ambient bed should continue through combat');
    const activeWarTracks = log.filter((node) => !node.paused && node.src !== 'ambient' && node.src !== wardrumNodes[0].src);
    assert.strictEqual(activeWarTracks.length, 1, 'war mode should play exactly one ambience track alongside ambient');
    assert.ok(['war_a', 'war_b'].includes(activeWarTracks[0].src), 'war ambience should rotate between configured tracks');
}

function testExitCombatRehomesAmbientAndPlaysOutcome() {
    const log = [];
    const manager = new AudioManager({
        victory: { src: 'victory', cooldownMs: 0 },
        defeat: { src: 'defeat', cooldownMs: 0 }
    }, { createAudio: createStubFactory(log) });

    const conductor = {
        enterModes: [],
        startCalls: 0,
        enterMode(mode) { this.enterModes.push(mode); },
        start(args) { this.startArgs = args; this.startCalls += 1; }
    };

    exitCombat('victory', manager, conductor);
    assert.strictEqual(conductor.enterModes[0], 'TERRITORY', 'victory should bounce ambience back to territory');
    assert.strictEqual(conductor.startArgs.fadeMs, 0, 'victory should restart ambience without delays');
    assert.ok(log.find((node) => node.src === 'victory'), 'victory stinger should play');

    exitCombat('retreat', manager, conductor);
    assert.ok(log.find((node) => node.src === 'defeat'), 'retreat fallback should reuse defeat sting');
}

function testImperialQueuesAvoidWardrums() {
    const previousRebelSystem = global.RebelSystem;
    const previousTutorial = global.TutorialCallouts;

    class Hex {
        constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
        toString() { return `${this.q},${this.r}`; }
    }

    global.RebelSystem = {
        spawnRebelCampNearFrontier: (gameState) => {
            const tile = { hex: new Hex(1, 0), type: 'rebelcamp', prevType: 'field', toString() { return this.hex.toString(); } };
            gameState.overworld.hexes.set(tile.toString(), tile);
            return tile;
        }
    };
    global.TutorialCallouts = previousTutorial || {};

    const ImperialMandates = initImperialMandates(globalThis);
    ImperialMandates.resetForNewCampaign();

    const playLog = [];
    const origin = new Hex(0, 0);
    const gameState = {
        Hex,
        overworld: { hexes: new Map([[origin.toString(), { hex: origin, type: 'castle' }]]) },
        gold: 240,
        wood: 0,
        calcOverworldGhosts: () => {},
        playSound: (key) => playLog.push(key)
    };
    const uiBindings = { enqueueNotification: () => null, showImperialModal: () => null };

    ImperialMandates.issuePendingMandates(gameState, uiBindings);

    assert.strictEqual(playLog.includes('wardrum'), false, 'imperial mandate issuance should not trigger combat stingers');
    assert.strictEqual(playLog.length, 0, 'imperial notifications should remain silent or use non-combat cues');

    if (typeof previousRebelSystem === 'undefined') delete global.RebelSystem; else global.RebelSystem = previousRebelSystem;
    if (typeof previousTutorial === 'undefined') delete global.TutorialCallouts; else global.TutorialCallouts = previousTutorial;
}

function testImperialMessagingGuardsWardrumPlayback() {
    const previousRebelSystem = global.RebelSystem;
    const previousTutorial = global.TutorialCallouts;
    const previousGameAudio = global.GameAudio;

    const playLog = [];
    const manager = attachCombatStingerGuards(new AudioManager({
        wardrum: { src: 'wardrum', cooldownMs: 0 }
    }, { createAudio: createStubFactory(playLog) }));

    class Hex {
        constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
        toString() { return `${this.q},${this.r}`; }
    }

    global.GameAudio = manager;
    global.RebelSystem = {
        spawnRebelCampNearFrontier: (gameState) => {
            const tile = { hex: new Hex(1, 0), type: 'rebelcamp', prevType: 'field', toString() { return this.hex.toString(); } };
            gameState.overworld.hexes.set(tile.toString(), tile);
            return tile;
        }
    };
    global.TutorialCallouts = previousTutorial || {};

    const ImperialMandates = initImperialMandates(globalThis);
    ImperialMandates.resetForNewCampaign();

    const origin = new Hex(0, 0);
    const gameState = {
        Hex,
        overworld: { hexes: new Map([[origin.toString(), { hex: origin, type: 'castle' }]]) },
        gold: 240,
        wood: 0,
        calcOverworldGhosts: () => {}
    };

    const uiBindings = {
        enqueueNotification: () => manager.play('wardrum', { allowOverlap: true }),
        showImperialModal: () => manager.play('wardrum', { allowOverlap: true })
    };

    ImperialMandates.issuePendingMandates(gameState, uiBindings);

    assert.strictEqual(playLog.length, 0, 'imperial messaging should not trigger wardrum playback');

    const conductor = {
        stopCurrentCalls: 0,
        stopArgs: null,
        enterModes: [],
        startArgs: null,
        stopCurrent(args) { this.stopCurrentCalls += 1; this.stopArgs = args; },
        clearTimers() { this.cleared = true; },
        enterMode(mode) { this.enterModes.push(mode); },
        start(args) { this.startArgs = args; }
    };

    enterCombat(manager, conductor);

    const wardrumNode = playLog.find((node) => node.src === 'wardrum');
    assert.ok(wardrumNode, 'combat entry should still fire wardrum immediately');
    assert.strictEqual(wardrumNode.playCount, 1, 'wardrum should only play once during combat entry');

    if (typeof previousRebelSystem === 'undefined') delete global.RebelSystem; else global.RebelSystem = previousRebelSystem;
    if (typeof previousTutorial === 'undefined') delete global.TutorialCallouts; else global.TutorialCallouts = previousTutorial;
    if (typeof previousGameAudio === 'undefined') delete global.GameAudio; else global.GameAudio = previousGameAudio;
}

async function run() {
    testAmbientRandomizerUsesFairWeightsAndDelays();
    testAmbientRandomizerAvoidsImmediateRepeats();
    testAmbientSchedulerClearsAllTrackedTimers();
    testCooldownPreventsSpam();
    await testPlaybackUnlockRetriesBlockedAudio();
    testOverlapCreatesClone();
    testAmbientLoop();
    testAmbientLoopReportsIntent();
    testWeightedSelectionUsesRandomizer();
    testAmbientConductorModes();
    testConductorLimitsFadeDurationsAndStopsOverlap();
    testStopCurrentPreservesActiveHandleIdentity();
    testModeTransitionsSilencePreviousPlaylist();
    testAmbientBedsFollowModeChanges();
    testAmbientBedsCanBeDisabled();
    testManifestIncludesNewEffects();
    testTerritoryStartAvoidsLayeringAmbientTwice();
    testGroupedPlaybackCoalescesBursts();
    testLiveNodeSnapshotBackfill();
    testSyncDebugBusRegistersExistingNodes();
    testEnterCombatKeepsAmbientAndFiresWardrumImmediately();
    testWardrumStingerDoesNotLoopAfterCombatStart();
    testExitCombatRehomesAmbientAndPlaysOutcome();
    testImperialQueuesAvoidWardrums();
    testImperialMessagingGuardsWardrumPlayback();
    console.log('All audio tests passed.');
}

await loadAudioModule();
await run();
