import assert from 'assert';
import {
    BOOT_PHASES,
    getBootPhase,
    onBootPhaseChange,
    registerBootDependencies,
    setBootPhase
} from '../scripts/bootManager.js';

function createStubOverlay() {
    return {
        showed: 0,
        hidden: 0,
        show() { this.showed += 1; },
        hide() { this.hidden += 1; },
        notifyUIReady() { this.notified = true; },
        notified: false,
        active: true
    };
}

function createStubAudio() {
    return {
        guardStates: [],
        setUiOverlayGuard(active) {
            this.guardStates.push(Boolean(active));
        }
    };
}

function createStubDebugEl() {
    const classSet = new Set();
    return {
        classList: {
            add: (...tokens) => tokens.forEach((token) => classSet.add(token)),
            remove: (...tokens) => tokens.forEach((token) => classSet.delete(token)),
            contains: (token) => classSet.has(token)
        }
    };
}

function testBootPhaseTransitions() {
    const bootOverlay = createStubOverlay();
    const introOverlay = createStubOverlay();
    const audioManager = createStubAudio();
    const debugEl = createStubDebugEl();

    debugEl.classList.add('visible');

    registerBootDependencies({
        bootOverlay,
        introOverlay,
        audioManager,
        debugEl
    });

    setBootPhase(BOOT_PHASES.LOADING);
    assert.strictEqual(getBootPhase(), BOOT_PHASES.LOADING, 'boot phase should be LOADING');
    assert.strictEqual(bootOverlay.showed, 1, 'boot overlay should show during loading');
    assert.ok(audioManager.guardStates.at(-1), 'audio should be guarded during loading');
    assert.ok(!debugEl.classList.contains('visible'), 'debug log should hide during loading');

    setBootPhase(BOOT_PHASES.INTRO);
    assert.strictEqual(getBootPhase(), BOOT_PHASES.INTRO, 'boot phase should be INTRO');
    assert.strictEqual(bootOverlay.hidden, 1, 'boot overlay should hide for intro');
    assert.ok(introOverlay.notified, 'intro overlay should be notified when intro phase begins');
    assert.ok(audioManager.guardStates.at(-1), 'audio should stay guarded during intro');

    setBootPhase(BOOT_PHASES.READY);
    assert.strictEqual(getBootPhase(), BOOT_PHASES.READY, 'boot phase should be READY');
    assert.strictEqual(audioManager.guardStates.at(-1), false, 'audio guard should release when ready');
}

function testBootPhaseListeners() {
    const seen = [];
    const unsubscribe = onBootPhaseChange((phase) => seen.push(phase));

    setBootPhase(BOOT_PHASES.LOADING);
    setBootPhase(BOOT_PHASES.READY);
    unsubscribe();
    setBootPhase(BOOT_PHASES.INTRO);

    assert.deepStrictEqual(seen, [BOOT_PHASES.LOADING, BOOT_PHASES.READY], 'listeners should capture boot phase transitions until unsubscribed');
}

function run() {
    testBootPhaseTransitions();
    testBootPhaseListeners();
    setBootPhase(BOOT_PHASES.READY);
    console.log('Boot manager tests passed.');
}

run();
