const assert = require('assert');
const IntroOverlay = require('../scripts/introOverlay.js');

function createStubElement() {
    const listeners = {};
    const classSet = new Set();
    return {
    style: { setProperty(name, value) { this[name] = String(value); } },
        textContent: '',
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
    const bodyEl = createStubElement();
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
    IntroOverlay.bodyEl = null;
    IntroOverlay.active = true;
    IntroOverlay.init(doc);

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
    IntroOverlay.overlayEl = null;
    IntroOverlay.beginBtn = null;
    IntroOverlay.bodyEl = null;
    IntroOverlay.active = true;
    IntroOverlay.init(doc);

    assert.ok(doc.bodyEl.textContent.length > 0, 'init should populate intro copy text');
    assert.ok(doc.bodyEl.textContent.includes('April'), 'init copy should reference the April start');
}

function run() {
    testDismissAddsHiddenClass();
    testTransitionClearsPointerFlow();
    testSeasonalCopyMentionsAprilAndFrontier();
    testInitAppliesSeasonalCopy();
    console.log('All intro overlay tests passed.');
}

run();
