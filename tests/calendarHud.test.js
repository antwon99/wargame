const assert = require('assert');
const fs = require('fs');

function createStubElement(id) {
    return {
        id,
        innerText: '',
        title: ''
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

    const timekeeper = new Timekeeper({ startTick: 6 }); // Day 7
    const game = {
        gold: 42,
        wood: 9,
        research: { lives: 2 },
        imperialFavor: 5,
        difficulty: 3,
        timekeeper
    };

    updateHUD(game);
    assert.strictEqual(doc.getElementById('calendar-readout').innerText, 'Month 1, Week 1, Day 7');
}

function testTemplateHasCalendarPill() {
    const html = fs.readFileSync('Wargame.html', 'utf8');
    assert.ok(html.includes('id="calendar-readout"'), 'HUD template should expose calendar pill');
}

async function run() {
    await testCalendarPillRenders();
    testTemplateHasCalendarPill();
    delete global.document;
    console.log('Calendar HUD tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
