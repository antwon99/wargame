const assert = require('assert');
const IntroOverlay = require('../scripts/introOverlay.js');

function createStubElement() {
    const listeners = {};
    const classSet = new Set();
    return {
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
        }
    };
}

function buildStubDocument() {
    const overlayEl = createStubElement();
    const btnEl = createStubElement();
    return {
        getElementById: id => {
            if (id === 'intro-overlay') return overlayEl;
            if (id === 'btn-intro-begin') return btnEl;
            return null;
        },
        overlayEl,
        btnEl
    };
}

function testDismissAddsHiddenClass() {
    const doc = buildStubDocument();
    const initialized = IntroOverlay.init(doc);
    assert.ok(initialized, 'init should wire the overlay when elements exist');

    doc.btnEl.trigger('click');
    assert.ok(doc.overlayEl.classList.contains('intro-hidden'), 'clicking begin should hide overlay');
}

function testTransitionClearsPointerFlow() {
    const doc = buildStubDocument();
    IntroOverlay.overlayEl = null; // reset between runs
    IntroOverlay.beginBtn = null;
    IntroOverlay.active = true;
    IntroOverlay.init(doc);

    doc.btnEl.trigger('click');
    doc.overlayEl.trigger('transitionend');
    assert.strictEqual(doc.overlayEl.style.display, 'none', 'transition end should drop overlay from layout');
}

function run() {
    testDismissAddsHiddenClass();
    testTransitionClearsPointerFlow();
    console.log('All intro overlay tests passed.');
}

run();
