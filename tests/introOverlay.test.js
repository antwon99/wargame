import assert from 'assert';
import { IntroOverlay } from '../scripts/introOverlay.js';

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
    const aprilCopy = IntroOverlay.buildIntroCopy(new Date('2024-04-10'));
    assert.ok(aprilCopy.includes('April'), 'April copy should mention the month');
    assert.ok(aprilCopy.toLowerCase().includes('frontier'), 'April copy should mention frontier deployments');

    const autumnCopy = IntroOverlay.buildIntroCopy(new Date('2024-10-02'));
    assert.ok(autumnCopy.includes('April'), 'Non-spring copy should still anchor to the April kickoff');
    assert.ok(autumnCopy.toLowerCase().includes('frontier'), 'Non-spring copy should keep frontier deployments visible');
}

function testInitAppliesSeasonalCopy() {
    const doc = buildStubDocument();
    resetIntroOverlayState();
    IntroOverlay.initIntroOverlay
        ? IntroOverlay.initIntroOverlay(globalThis, { document: doc, defer: false })
        : IntroOverlay.init(doc);

    assert.ok(doc.bodyEl.textContent.length > 0, 'init should populate intro copy text');
    assert.ok(doc.bodyEl.textContent.includes('April'), 'init copy should reference the April start');
}

function testInitSkipsCopyWhenAlreadyMatches() {
    const expectedCopy = IntroOverlay.buildIntroCopy();
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
    testInitSkipsCopyWhenAlreadyMatches();
    testStorageAccessorFailureIsSafe();
    console.log('All intro overlay tests passed.');
}

run();
