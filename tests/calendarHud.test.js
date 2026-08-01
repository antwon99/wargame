import assert from 'assert';
import fs from 'fs';

function createStubElement(id) {
    const classes = new Set();
    const attributes = new Map();
    return {
        id,
        innerText: '',
        title: '',
        classList: {
            add: (...tokens) => tokens.forEach((t) => classes.add(t)),
            remove: (...tokens) => tokens.forEach((t) => classes.delete(t)),
            toggle: (token, force) => {
                if (force === undefined) {
                    if (classes.has(token)) { classes.delete(token); return false; }
                    classes.add(token); return true;
                }
                if (force) { classes.add(token); return true; }
                classes.delete(token); return false;
            },
            contains: (token) => classes.has(token)
        },
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name); }
    };
}

function createStubDocument(ids = []) {
    const elements = new Map();
    const doc = {
        getElementById: (id) => elements.get(id) || null,
        register: (id) => {
            const el = createStubElement(id);
            elements.set(id, el);
            return el;
        }
    };
    ids.forEach((id) => doc.register(id));
    return doc;
}

async function testCalendarPillRenders() {
    const doc = createStubDocument(['gold', 'wood', 'lives-count', 'imperial-favor', 'lvl-txt', 'calendar-readout']);
    global.document = doc;
    const { updateHUD } = await import('../scripts/uiBindings.js');
    const { Timekeeper } = await import('../scripts/timekeeper.js');

    const timekeeper = new Timekeeper({ startTick: 6 }); // Day 7 in the 7-day week
    const game = {
        gold: 42,
        wood: 9,
        research: { lives: 2 },
        imperialFavor: 5,
        difficulty: 3,
        timekeeper
    };

    updateHUD(game);
    assert.strictEqual(doc.getElementById('calendar-readout').innerText, 'M: Jan Y1 | W: 1/4 | D: 7/28');
}

async function testCalendarAndPauseStateChanges() {
    const doc = createStubDocument([
        'gold', 'wood', 'lives-count', 'imperial-favor', 'lvl-txt', 'calendar-readout', 'btn-pause', 'pause-indicator'
    ]);
    global.document = doc;
    const { updateHUD } = await import('../scripts/uiBindings.js');
    const { Timekeeper } = await import('../scripts/timekeeper.js');

    const timekeeper = new Timekeeper({ startTick: 0 });
    const game = {
        gold: 0,
        wood: 0,
        research: { lives: 1 },
        imperialFavor: 6,
        difficulty: 1,
        paused: false,
        timekeeper
    };

    updateHUD(game);
    const initialCalendar = doc.getElementById('calendar-readout').innerText;
    assert.strictEqual(initialCalendar, 'M: Jan Y1 | W: 1/4 | D: 1/28');
    const pauseIndicator = doc.getElementById('pause-indicator');
    assert.strictEqual(pauseIndicator.innerText, 'Live');
    assert.ok(!pauseIndicator.classList.contains('paused'));

    game.paused = true;
    timekeeper.advance(2);
    updateHUD(game);

    assert.strictEqual(doc.getElementById('calendar-readout').innerText, 'M: Jan Y1 | W: 1/4 | D: 3/28');
    const pauseBtn = doc.getElementById('btn-pause');
    assert.strictEqual(pauseBtn.innerText, '▶️ Resume');
    assert.strictEqual(pauseBtn.getAttribute?.('aria-pressed') || pauseBtn['aria-pressed'], 'true');
    assert.strictEqual(pauseIndicator.innerText, 'Paused');
    assert.ok(pauseIndicator.classList.contains('paused'), 'pause indicator should reflect paused state');
}

function testTemplateHasCalendarPill() {
    const html = fs.readFileSync('Wargame.html', 'utf8');
    assert.ok(html.includes('id="calendar-readout"'), 'HUD template should expose calendar pill');
}

async function run() {
    await testCalendarPillRenders();
    await testCalendarAndPauseStateChanges();
    testTemplateHasCalendarPill();
    delete global.document;
    console.log('Calendar HUD tests passed.');
}

await run();
