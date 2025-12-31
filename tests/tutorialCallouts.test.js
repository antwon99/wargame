import assert from 'assert';
import { createTutorialCallouts } from '../scripts/tutorialCallouts.js';

function createStubElement(rect = { left: 0, top: 0, width: 200, height: 90 }) {
    const classSet = new Set();
    const listeners = {};
    const el = {
        style: {},
        children: [],
        removed: false,
        className: '',
        __rect: rect,
        classList: {
            add: (...names) => names.forEach((n) => classSet.add(n)),
            remove: (...names) => names.forEach((n) => classSet.delete(n)),
            contains: (name) => classSet.has(name)
        },
        appendChild(child) { this.children.push(child); },
        remove() { this.removed = true; },
        getBoundingClientRect() {
            const r = this.__rect || {};
            const width = r.width ?? 0;
            const height = r.height ?? 0;
            const left = r.left ?? 0;
            const top = r.top ?? 0;
            return { left, top, width, height, right: r.right ?? left + width, bottom: r.bottom ?? top + height };
        },
        addEventListener: (event, cb) => { listeners[event] = cb; },
        trigger: (event) => { if (listeners[event]) listeners[event](); }
    };
    return el;
}

function buildStubDom() {
    const anchorEl = createStubElement({ left: 240, top: 320, width: 60, height: 60 });
    const container = createStubElement();
    container.id = 'game-container';
    const body = createStubElement();
    body.appendChild = (child) => body.children.push(child);
    const timers = [];
    const frames = [];
    const stubSetTimeout = (cb, delay) => {
        const timer = { cb, delay, cancelled: false };
        timers.push(timer);
        return timer;
    };
    const stubClearTimeout = (timer) => {
        if (!timer) return;
        const target = timers.find((t) => t === timer);
        if (target) target.cancelled = true;
    };
    const stubRequestAnimationFrame = (cb) => {
        const frame = { cb, cancelled: false };
        frames.push(frame);
        return frame;
    };
    const stubCancelAnimationFrame = (frame) => {
        if (!frame) return;
        const target = frames.find((f) => f === frame);
        if (target) target.cancelled = true;
    };
    const listenerMap = {};
    const doc = {
        body,
        getElementById: (id) => (id === 'game-container' ? container : null),
        createElement: (tag) => {
            const rect = tag === 'button' ? { left: 0, top: 0, width: 90, height: 36 } : { left: 0, top: 0, width: 200, height: 90 };
            return createStubElement(rect);
        }
    };
    const win = {
        innerWidth: 800,
        innerHeight: 600,
        requestAnimationFrame: stubRequestAnimationFrame,
        cancelAnimationFrame: stubCancelAnimationFrame,
        setTimeout: stubSetTimeout,
        clearTimeout: stubClearTimeout,
        addEventListener: (event, cb) => {
            listenerMap[event] = listenerMap[event] || new Set();
            listenerMap[event].add(cb);
        },
        removeEventListener: (event, cb) => {
            if (!listenerMap[event]) return;
            listenerMap[event].delete(cb);
        },
        __timers: timers,
        __frames: frames,
        __listeners: listenerMap,
        __runFrames: () => {
            const pending = [...frames];
            frames.length = 0;
            pending.forEach((frame) => {
                if (!frame.cancelled) frame.cb();
            });
        },
        __dispatch: (event) => {
            const listeners = listenerMap[event];
            if (!listeners) return;
            listeners.forEach((cb) => cb());
        }
    };
    return { anchorEl, container, body, document: doc, window: win };
}

function withStubbedDom(cb) {
    const originalWindow = global.window;
    const originalDocument = global.document;
    const originalRAF = global.requestAnimationFrame;
    const originalCancelRAF = global.cancelAnimationFrame;
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const env = buildStubDom();
    global.window = env.window;
    global.document = env.document;
    global.requestAnimationFrame = env.window.requestAnimationFrame;
    global.cancelAnimationFrame = env.window.cancelAnimationFrame;
    global.setTimeout = env.window.setTimeout;
    global.clearTimeout = env.window.clearTimeout;
    delete global.TutorialCallouts;
    const TutorialCallouts = createTutorialCallouts(env.window);
    try {
        cb(TutorialCallouts, env);
    } finally {
        global.window = originalWindow;
        global.document = originalDocument;
        global.requestAnimationFrame = originalRAF;
        global.cancelAnimationFrame = originalCancelRAF;
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
        delete global.TutorialCallouts;
    }
}

function testCalloutAnchorsAboveTile() {
    withStubbedDom((TutorialCallouts, env) => {
        const anchorRect = env.anchorEl.getBoundingClientRect();
        TutorialCallouts.showTileCallout({}, { element: env.anchorEl }, { title: 'Test', body: 'Body', buttonText: 'OK' });
        const callout = env.document.getElementById('game-container').children.find((el) => el.className === 'tile-callout');
        const connector = env.document.getElementById('game-container').children.find((el) => el.className === 'tile-callout__connector');

        assert.ok(callout, 'callout should be appended');
        assert.ok(connector, 'connector should be appended');
        assert.ok(parseFloat(callout.style.top) < anchorRect.top, 'callout should prefer rendering above the anchor');
        assert.strictEqual(connector.style.left, `${anchorRect.left + anchorRect.width / 2}px`, 'connector should center on anchor');
    });
}

function testHideRemovesElements() {
    withStubbedDom((TutorialCallouts, env) => {
        TutorialCallouts.showTileCallout({}, { element: env.anchorEl }, { title: 'Hide me' });
        TutorialCallouts.hideTileCallout();
        const removalFlags = env.document.getElementById('game-container').children.map((child) => child.removed);
        assert.ok(removalFlags.every(Boolean), 'callout and connector should be removed on hide');
        const cancelledFrames = env.window.__frames.filter((frame) => frame.cancelled);
        assert.ok(cancelledFrames.length >= 1, 'reflow frame should be cancelled on hide');
    });
}

function testOnConfirmRunsWithoutDom() {
    const originalWindow = global.window;
    const originalDocument = global.document;
    delete global.window;
    delete global.document;
    delete global.TutorialCallouts;
    const TutorialCallouts = createTutorialCallouts(globalThis);
    let confirmed = false;
    TutorialCallouts.showTileCallout({}, {}, { onConfirm: () => { confirmed = true; } });
    assert.ok(confirmed, 'onConfirm should execute when document is unavailable');
    global.window = originalWindow;
    global.document = originalDocument;
}

function testAutoHideUsesDefaultDuration() {
    withStubbedDom((TutorialCallouts, env) => {
        TutorialCallouts.showTileCallout({}, { element: env.anchorEl }, { title: 'Timed' });
        assert.strictEqual(env.window.__timers.length, 1, 'auto-hide timer should be scheduled');
        const [timer] = env.window.__timers;
        assert.strictEqual(timer.delay, 5000, 'default duration should be 5 seconds');
        timer.cb();
        const removalFlags = env.document.getElementById('game-container').children.map((child) => child.removed);
        assert.ok(removalFlags.every(Boolean), 'auto-hide should remove callout elements');
    });
}

function testDismissCancelsAutoHideTimer() {
    withStubbedDom((TutorialCallouts, env) => {
        TutorialCallouts.showTileCallout({}, { element: env.anchorEl }, { title: 'Cancelable timer' });
        const callout = env.document.getElementById('game-container').children.find((el) => el.className === 'tile-callout');
        const button = callout.children.find((el) => el.className === 'tile-callout__btn');
        button.trigger('click');
        const [timer] = env.window.__timers;
        assert.ok(timer.cancelled, 'dismiss click should clear auto-hide timer');
    });
}

function testCalloutRepositionsWithFramesAndResize() {
    withStubbedDom((TutorialCallouts, env) => {
        TutorialCallouts.showTileCallout({}, { element: env.anchorEl }, { title: 'Follow me' });
        const callout = env.document.getElementById('game-container').children.find((el) => el.className === 'tile-callout');

        const initialLeft = parseFloat(callout.style.left);
        env.anchorEl.__rect.left += 120;
        env.anchorEl.__rect.top += 80;

        env.window.__runFrames();
        const updatedLeft = parseFloat(callout.style.left);
        assert.notStrictEqual(updatedLeft, initialLeft, 'callout should update position on animation frame');

        env.anchorEl.__rect.left += 40;
        env.anchorEl.__rect.top += 20;
        env.window.__dispatch('resize');
        const resizedLeft = parseFloat(callout.style.left);
        assert.notStrictEqual(resizedLeft, updatedLeft, 'callout should reflow when window resizes');
    });
}

function run() {
    testCalloutAnchorsAboveTile();
    testHideRemovesElements();
    testOnConfirmRunsWithoutDom();
    testAutoHideUsesDefaultDuration();
    testDismissCancelsAutoHideTimer();
    testCalloutRepositionsWithFramesAndResize();
    console.log('All tutorial callout tests passed.');
}

run();
