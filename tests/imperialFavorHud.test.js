const assert = require('assert');
const fs = require('fs');
const { clampImperialFavor } = require('../scripts/imperialFavor.js');

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

async function testUpdateHUDWritesFavor() {
    const doc = createStubDocument(['gold', 'wood', 'lives-count', 'imperial-favor', 'lvl-txt']);
    global.document = doc;
    const { updateHUD } = await import('../scripts/ui/hud.js');

    const game = {
        gold: 12.9,
        wood: 3.1,
        research: { lives: 2 },
        imperialFavor: 11,
        difficulty: 4
    };

    updateHUD(game);
    assert.strictEqual(String(doc.getElementById('gold').innerText), '12');
    assert.strictEqual(String(doc.getElementById('wood').innerText), '3');
    assert.strictEqual(doc.getElementById('lives-count').innerText, 2);
    assert.strictEqual(
        String(doc.getElementById('imperial-favor').innerText),
        String(clampImperialFavor(game.imperialFavor)),
        'favor should clamp to HUD max'
    );
    assert.strictEqual(doc.getElementById('lvl-txt').innerText, 'Lv.4');
}

function testTemplateIncludesTooltip() {
    const html = fs.readFileSync('Wargame.html', 'utf8');
    assert.ok(html.includes('id="imperial-favor"'), 'imperial favor value should exist in HUD template');
    assert.ok(
        html.includes('Higher favor reduces taxes; lower favor increases pressure.'),
        'imperial favor pill should expose hover tooltip text'
    );
}

async function run() {
    await testUpdateHUDWritesFavor();
    testTemplateIncludesTooltip();
    delete global.document;
    console.log('Imperial favor HUD tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
