import assert from 'assert';
import { updateHUD } from '../scripts/uiBindings.js';

function createStubElement(id = '') {
    const attributes = new Map();
    const el = {
        id,
        children: [],
        style: {
            setProperty(key, value) { this[key] = value; }
        },
        dataset: {},
        innerText: '',
        classList: {
            _set: new Set(),
            add: (...tokens) => tokens.forEach(t => el.classList._set.add(t)),
            remove: (...tokens) => tokens.forEach(t => el.classList._set.delete(t)),
            contains: (token) => el.classList._set.has(token),
            toggle: (token, force) => {
                const shouldAdd = typeof force === 'boolean' ? force : !el.classList._set.has(token);
                if (shouldAdd) el.classList._set.add(token);
                else el.classList._set.delete(token);
                return shouldAdd;
            }
        },
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name); }
    };
    return el;
}

function createStubDocument() {
    const elements = new Map();
    const register = (id, el = createStubElement(id)) => {
        elements.set(id, el);
        return el;
    };
    const document = {
        body: register('body'),
        getElementById: (id) => elements.get(id) || null,
        querySelector: (selector) => {
            if (selector === '#combat-ultimate-hud .ultimate-ring') {
                const hud = elements.get('combat-ultimate-hud');
                return hud?.children.find(child => child.classList?.contains('ultimate-ring')) || null;
            }
            return null;
        },
        register
    };
    return document;
}

function resetGlobals(document, windowStub) {
    global.document = document;
    global.window = windowStub;
}

function restoreGlobals(originalDocument, originalWindow) {
    global.document = originalDocument;
    global.window = originalWindow;
}

function seedHudElements(document) {
    ['gold', 'wood', 'lives-count', 'imperial-favor', 'calendar-readout', 'btn-pause', 'pause-indicator', 'lvl-txt']
        .forEach(id => document.register(id, createStubElement(id)));

    const hud = document.register('combat-ultimate-hud', createStubElement('combat-ultimate-hud'));
    hud.dataset = { ultimateId: 'rush' };
    const ring = createStubElement();
    ring.classList.add('ultimate-ring');
    hud.appendChild(ring);

    document.register('ultimate-button', createStubElement('ultimate-button'));
    document.register('ultimate-icon', createStubElement('ultimate-icon'));
}

function buildGameState() {
    return {
        gold: 120,
        wood: 45,
        research: { lives: 1 },
        imperialFavor: 6,
        paused: false,
        stats: { warsWon: 0 },
        state: 'OVERWORLD',
        combat: {
            warElapsedMs: 0,
            ultimates: {
                readyAtMs: { rush: 10000 },
                chargeMs: { rush: 0 },
                consumed: { rush: false },
                activeEffects: {},
                levels: { rush: 1 }
            }
        }
    };
}

function testUltimateHudUpdates() {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const document = createStubDocument();
    resetGlobals(document, { document });

    seedHudElements(document);
    const game = buildGameState();

    updateHUD(game);
    const hud = document.getElementById('combat-ultimate-hud');
    assert.strictEqual(hud.getAttribute('aria-hidden'), 'true', 'ultimate HUD should stay hidden outside combat');
    assert.ok(!hud.classList.contains('is-visible'), 'ultimate HUD should not be visible outside combat');

    game.state = 'COMBAT';
    game.combat.ultimates.chargeMs.rush = 5000;
    updateHUD(game);
    const ring = document.querySelector('#combat-ultimate-hud .ultimate-ring');
    assert.strictEqual(ring.style['--charge-progress'], '0.5', 'ultimate ring should show 50% charge');
    assert.ok(
        document.getElementById('ultimate-button').getAttribute('aria-label')?.includes('Rush'),
        'ultimate button should describe the selected ultimate via aria-label'
    );

    game.combat.ultimates.chargeMs.rush = 10000;
    updateHUD(game);
    assert.ok(document.getElementById('ultimate-button').classList.contains('ultimate-button--ready'), 'ultimate should mark ready state');

    game.combat.warElapsedMs = 3000;
    game.combat.ultimates.activeEffects.rush = { activatedAtMs: 0 };
    updateHUD(game);
    const activeProgress = Number(ring.style['--charge-progress']);
    assert.ok(activeProgress < 1 && activeProgress > 0, 'ultimate ring should deplete while active');

    game.combat.ultimates.consumed.rush = true;
    updateHUD(game);
    assert.ok(document.getElementById('ultimate-button').classList.contains('ultimate-button--disabled'), 'ultimate should disable after use');

    restoreGlobals(originalDocument, originalWindow);
    console.log('Ultimate HUD tests passed.');
}

testUltimateHudUpdates();
