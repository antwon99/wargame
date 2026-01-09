import assert from 'assert';
import fs from 'fs';

function createStubElement(id) {
    const classes = new Set();
    const attributes = new Map();
    return {
        id,
        innerText: '',
        dataset: {},
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

async function testPaintClaimHudIndicator() {
    const doc = createStubDocument([
        'gold',
        'wood',
        'lives-count',
        'imperial-favor',
        'lvl-txt',
        'paint-claim-status',
        'btn-claim-paint'
    ]);
    global.document = doc;
    const { updateHUD } = await import('../scripts/uiBindings.js');

    const game = {
        gold: 100,
        wood: 80,
        research: { lives: 0 },
        imperialFavor: 0,
        difficulty: 0,
        paintClaimMode: true,
        paintClaimStatus: 'Painted frontier for 8w. 72w left.',
        paintClaimStatusTone: 'success'
    };

    updateHUD(game);

    const status = doc.getElementById('paint-claim-status');
    const button = doc.getElementById('btn-claim-paint');
    assert.strictEqual(status.innerText, game.paintClaimStatus, 'paint status should mirror game message');
    assert.strictEqual(status.dataset.tone, 'success');
    assert.ok(status.classList.contains('paint-claim-status--active'), 'status should reflect active mode');
    assert.strictEqual(button.getAttribute('aria-pressed'), 'true');
}

function testTemplateHasPaintClaimControls() {
    const html = fs.readFileSync('Wargame.html', 'utf8');
    assert.ok(html.includes('id="btn-claim-paint"'), 'HUD template should expose paint claim toggle');
    assert.ok(html.includes('id="paint-claim-status"'), 'HUD template should expose paint claim status');
}

async function run() {
    await testPaintClaimHudIndicator();
    testTemplateHasPaintClaimControls();
    delete global.document;
    console.log('Paint claim HUD tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
