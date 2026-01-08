import assert from 'assert';
import { IntroOverlay } from '../scripts/introOverlay.js';

const EXPECTED_INTRO_COPY = 'While April’s thaw marks your arrival, the frontier offers only a brief reprieve. The first deployments are still breaking ground, but the sun is already setting sooner. Use this spring to build; in this land, the shadow of winter is never far behind.';

function createStubElement(initialText = '') {
    const listeners = {};
    const classSet = new Set();
    let textValue = initialText;
    let setCount = 0;
    const element = {
        style: {},
        addEventListener: (event, cb) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(cb);
        },
        trigger: event => {
            (listeners[event] || []).forEach(cb => cb());
        },
        classList: {
            add: (...names) => names.forEach(n => classSet.add(n)),
            remove: (...names) => names.forEach(n => classSet.delete(n)),
            contains: name => classSet.has(name)
        },
        getTextSetCount: () => setCount
    };
    Object.defineProperty(element, 'textContent', {
        get: () => textValue,
        set: value => {
            textValue = value;
            setCount += 1;
        }
    });
    return element;
}

function buildStubDocument({ bodyText = '' } = {}) {
    const overlayEl = createStubElement();
    const btnEl = createStubElement();
    const bodyEl = createStubElement(bodyText);
    return {
        getElementById: id => {
            if (id === 'intro-overlay') return overlayEl;
            if (id === 'btn-intro-begin') return btnEl;
            if (id === 'intro-body') return bodyEl;
            return null;
        },
        overlayEl,
        btnEl,
        bodyEl
    };
}

function resetIntroOverlayState() {
    IntroOverlay.overlayEl = null;
    IntroOverlay.beginBtn = null;
    IntroOverlay.bodyEl = null;
    IntroOverlay.active = true;
    IntroOverlay.initialized = false;
    IntroOverlay.uiReady = false;
    IntroOverlay.pendingReveal = false;
}

function testDismissAddsHiddenClass() {
    const doc = buildStubDocument();
    resetIntroOverlayState();
    const initialized = IntroOverlay.initIntroOverlay
        ? IntroOverlay.initIntroOverlay(globalThis, { document: doc, defer: false }).initialized
        : IntroOverlay.init(doc);
    assert.ok(initialized, 'init should wire the overlay when elements exist');
    assert.strictEqual(IntroOverlay.initialized, true, 'init should flip the initialized guard');

    doc.btnEl.trigger('click');
    assert.ok(doc.overlayEl.classList.contains('intro-hidden'), 'clicking begin should hide overlay');
}

function testTransitionClearsPointerFlow() {
    const doc = buildStubDocument();
    resetIntroOverlayState();
    IntroOverlay.initIntroOverlay
        ? IntroOverlay.initIntroOverlay(globalThis, { document: doc, defer: false })
        : IntroOverlay.init(doc);

    doc.btnEl.trigger('click');
    doc.overlayEl.trigger('transitionend');
    assert.strictEqual(doc.overlayEl.style.display, 'none', 'transition end should drop overlay from layout');
}

function testSeasonalCopyMentionsAprilAndFrontier() {
    const copy = IntroOverlay.buildIntroCopy();
    assert.strictEqual(copy, EXPECTED_INTRO_COPY, 'intro copy should match the approved narrative');
}

function testInitAppliesSeasonalCopy() {
    const doc = buildStubDocument();
    resetIntroOverlayState();
    IntroOverlay.initIntroOverlay
        ? IntroOverlay.initIntroOverlay(globalThis, { document: doc, defer: false })
        : IntroOverlay.init(doc);

    assert.strictEqual(doc.bodyEl.textContent, EXPECTED_INTRO_COPY, 'init should populate the approved intro copy');
}

function testInitShowsOverlayAfterWiring() {
    const doc = buildStubDocument();
    doc.overlayEl.classList.add('intro-hidden');
    doc.overlayEl.style.display = 'none';
    resetIntroOverlayState();
    IntroOverlay.initIntroOverlay
        ? IntroOverlay.initIntroOverlay(globalThis, { document: doc, defer: false })
        : IntroOverlay.init(doc);

    assert.ok(doc.overlayEl.classList.contains('intro-hidden'), 'init should keep the overlay hidden until the UI is ready');
    assert.strictEqual(doc.overlayEl.style.display, 'none', 'init should keep the overlay out of layout before UI ready');

    IntroOverlay.notifyUIReady();
    assert.ok(!doc.overlayEl.classList.contains('intro-hidden'), 'notifyUIReady should reveal the overlay once UI is ready');
    assert.strictEqual(doc.overlayEl.style.display, 'flex', 'notifyUIReady should restore flex display for the overlay');
    assert.ok(doc.overlayEl.classList.contains('is-fading'), 'notifyUIReady should trigger a fade-in handoff');
}

function testInitSkipsCopyWhenAlreadyMatches() {
    const expectedCopy = EXPECTED_INTRO_COPY;
    const doc = buildStubDocument({ bodyText: expectedCopy });
    resetIntroOverlayState();
    IntroOverlay.initIntroOverlay
        ? IntroOverlay.initIntroOverlay(globalThis, { document: doc, defer: false })
        : IntroOverlay.init(doc);

    assert.strictEqual(doc.bodyEl.getTextSetCount(), 0, 'init should skip resetting intro copy when already present');
    assert.strictEqual(doc.bodyEl.textContent, expectedCopy, 'intro copy should remain unchanged when already set');
}

function testStorageAccessorFailureIsSafe() {
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
        value: {
            get localStorage() {
                throw new Error('denied');
            }
        },
        configurable: true
    });
    try {
        assert.strictEqual(IntroOverlay.hasSeenIntro(), false, 'hasSeenIntro should return false when storage is unavailable');
    } finally {
        if (typeof originalWindow === 'undefined') {
            delete globalThis.window;
        } else {
            Object.defineProperty(globalThis, 'window', {
                value: originalWindow,
                configurable: true
            });
        }
    }
}

function run() {
    testDismissAddsHiddenClass();
    testTransitionClearsPointerFlow();
    testSeasonalCopyMentionsAprilAndFrontier();
    testInitAppliesSeasonalCopy();
    testInitShowsOverlayAfterWiring();
    testInitSkipsCopyWhenAlreadyMatches();
    testStorageAccessorFailureIsSafe();
    console.log('All intro overlay tests passed.');
}

run();
