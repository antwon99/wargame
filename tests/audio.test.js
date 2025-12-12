const assert = require('assert');
const { AudioManager, SFX_MANIFEST, AmbientConductor, enterCombat, exitCombat, attachCombatStingerGuards } = require('../scripts/audio.js');

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
    assert.ok(SFX_MANIFEST.ambient_bed_wind, 'overworld wind bed should be mapped');
    assert.ok(SFX_MANIFEST.war_bed_horn, 'war horn bed should be mapped');
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

function testEnterCombatStopsAmbientAndFiresWardrumImmediately() {
    const log = [];
    const manager = new AudioManager({
        ambient: { src: 'ambient', isAmbient: true, cooldownMs: 0 },
        wardrum: { src: 'wardrum', cooldownMs: 0 }
    }, { createAudio: createStubFactory(log) });
    let managerStopAll = 0;
    const baseStopAll = manager.stopAll.bind(manager);
    manager.stopAll = () => { managerStopAll += 1; return baseStopAll(); };

    const conductor = {
        stopAllCalls: 0,
        startArgs: null,
        enterModes: [],
        stopAll() { this.stopAllCalls += 1; },
        clearTimers() { this.cleared = true; },
        enterMode(mode) { this.enterModes.push(mode); },
        start(args) { this.startArgs = args; }
    };

    enterCombat(manager, conductor);

    assert.strictEqual(conductor.stopAllCalls, 1, 'ambient should be stopped immediately when entering combat');
    assert.strictEqual(managerStopAll, 1, 'audio manager should clear out lingering loops on combat entry');
    assert.deepStrictEqual(conductor.enterModes[0], 'WAR', 'combat entry should switch the playlist to war');
    assert.strictEqual(conductor.startArgs.fadeMs, 0, 'combat start should resume scheduler without a delay');
    assert.ok(log.find((node) => node.src === 'wardrum'), 'wardrum stinger should play instantly');
    const wardrumNode = log.find((node) => node.src === 'wardrum');
    assert.strictEqual(wardrumNode.playCount, 1, 'wardrum should start playing right away');
}

function testExitCombatRehomesAmbientAndPlaysOutcome() {
    const log = [];
    const manager = new AudioManager({
        victory: { src: 'victory', cooldownMs: 0 },
        defeat: { src: 'defeat', cooldownMs: 0 }
    }, { createAudio: createStubFactory(log) });
    let managerStopAll = 0;
    const baseStopAll = manager.stopAll.bind(manager);
    manager.stopAll = () => { managerStopAll += 1; return baseStopAll(); };

    const conductor = {
        enterModes: [],
        startCalls: 0,
        stopAllCalls: 0,
        enterMode(mode) { this.enterModes.push(mode); },
        start(args) { this.startArgs = args; this.startCalls += 1; },
        stopAll() { this.stopAllCalls += 1; }
    };

    exitCombat('victory', manager, conductor);
    assert.strictEqual(managerStopAll, 1, 'combat exit should halt any overlapping ambience before playing stings');
    assert.strictEqual(conductor.stopAllCalls, 1, 'combat exit should clear ambient scheduler before resuming territory');
    assert.strictEqual(conductor.enterModes[0], 'TERRITORY', 'victory should bounce ambience back to territory');
    assert.strictEqual(conductor.startArgs.fadeMs, 0, 'victory should restart ambience without delays');
    assert.ok(log.find((node) => node.src === 'victory'), 'victory stinger should play');

    exitCombat('retreat', manager, conductor);
    assert.ok(log.find((node) => node.src === 'defeat'), 'retreat fallback should reuse defeat sting');
}

function testImperialQueuesAvoidWardrums() {
    const modulePath = require.resolve('../scripts/imperialMandates.js');
    const previousRebelSystem = global.RebelSystem;
    const previousTutorial = global.TutorialCallouts;
    delete require.cache[modulePath];

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

    const ImperialMandates = require('../scripts/imperialMandates.js');
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

    delete require.cache[modulePath];
    if (typeof previousRebelSystem === 'undefined') delete global.RebelSystem; else global.RebelSystem = previousRebelSystem;
    if (typeof previousTutorial === 'undefined') delete global.TutorialCallouts; else global.TutorialCallouts = previousTutorial;
}

function testImperialMessagingGuardsWardrumPlayback() {
    const modulePath = require.resolve('../scripts/imperialMandates.js');
    const previousRebelSystem = global.RebelSystem;
    const previousTutorial = global.TutorialCallouts;
    const previousGameAudio = global.GameAudio;
    delete require.cache[modulePath];

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

    const ImperialMandates = require('../scripts/imperialMandates.js');
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

    delete require.cache[modulePath];
    if (typeof previousRebelSystem === 'undefined') delete global.RebelSystem; else global.RebelSystem = previousRebelSystem;
    if (typeof previousTutorial === 'undefined') delete global.TutorialCallouts; else global.TutorialCallouts = previousTutorial;
    if (typeof previousGameAudio === 'undefined') delete global.GameAudio; else global.GameAudio = previousGameAudio;
}

function run() {
    testCooldownPreventsSpam();
    testOverlapCreatesClone();
    testAmbientLoop();
    testWeightedSelectionUsesRandomizer();
    testAmbientConductorModes();
    testConductorLimitsFadeDurationsAndStopsOverlap();
    testStopCurrentPreservesActiveHandleIdentity();
    testModeTransitionsSilencePreviousPlaylist();
    testAmbientBedsFollowModeChanges();
    testAmbientBedsCanBeDisabled();
    testManifestIncludesNewEffects();
    testEnterCombatStopsAmbientAndFiresWardrumImmediately();
    testExitCombatRehomesAmbientAndPlaysOutcome();
    testImperialQueuesAvoidWardrums();
    testImperialMessagingGuardsWardrumPlayback();
    console.log('All audio tests passed.');
}

try {
    run();
    process.exit(0);
} catch (err) {
    console.error(err);
    process.exit(1);
}
