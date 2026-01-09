import assert from 'assert';
import { applyUIBindings } from '../scripts/uiBindings.js';
import { DEFAULT_ULTIMATE_LEVELS, getUltimateUpgradeCost } from '../scripts/game/ultimatesConfig.js';

function createStubElement(id = '') {
    const attributes = new Map();
    return {
        id,
        innerText: '',
        title: '',
        disabled: false,
        classList: {
            toggle: () => {}
        },
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name); },
        querySelector: () => null
    };
}

function createStubDocument() {
    const elements = new Map();
    const register = (id, el = createStubElement(id)) => {
        elements.set(id, el);
        return el;
    };
    return {
        body: register('body'),
        getElementById: (id) => elements.get(id) || null,
        querySelector: (selector) => {
            const match = selector.match(/\[data-ultimate-(button|level|effect)="(.+)"\]/);
            if (match) {
                const type = match[1];
                const id = match[2];
                return elements.get(`${type}-${id}`) || null;
            }
            return null;
        },
        register
    };
}

function testUltimateDrawerUpdates() {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const document = createStubDocument();
    const windowStub = { document };
    global.document = document;
    global.window = windowStub;

    const rushLabel = createStubElement();
    const rushCost = createStubElement();
    const rushButton = createStubElement('buy-ultimate-rush');
    rushButton.querySelector = (selector) => {
        if (selector === '[data-ultimate-label="rush"]') return rushLabel;
        if (selector === '[data-ultimate-cost="rush"]') return rushCost;
        return null;
    };

    document.register('ultimate-rush-status', createStubElement('ultimate-rush-status'));
    document.register('level-rush', createStubElement('level-rush'));
    document.register('effect-rush', createStubElement('effect-rush'));
    document.register('button-rush', rushButton);
    document.register('buy-ultimate-rush', rushButton);

    document.register('level-manpower', createStubElement('level-manpower'));
    document.register('effect-manpower', createStubElement('effect-manpower'));
    document.register('button-manpower', createStubElement('buy-ultimate-manpower'));
    document.register('ultimate-manpower-status', createStubElement('ultimate-manpower-status'));
    document.register('level-gold', createStubElement('level-gold'));
    document.register('effect-gold', createStubElement('effect-gold'));
    document.register('button-gold', createStubElement('buy-ultimate-gold'));
    document.register('ultimate-gold-status', createStubElement('ultimate-gold-status'));

    const game = {
        gold: 1000,
        ultimates: { ...DEFAULT_ULTIMATE_LEVELS },
        buyUltimate: () => {},
        getUltimateUpgradeCost: (id) => getUltimateUpgradeCost(id, DEFAULT_ULTIMATE_LEVELS[id])
    };

    applyUIBindings(game);
    game.updateUltimatesUI();

    const status = document.getElementById('ultimate-rush-status');
    assert.strictEqual(status.innerText, 'Level 1', 'rush status should show current level');
    assert.ok(rushCost.innerText.includes('g'), 'rush cost should render a gold label');
    assert.ok(
        document.getElementById('effect-rush').innerText.includes('Rush:'),
        'rush effect should include descriptive text'
    );

    global.document = originalDocument;
    global.window = originalWindow;
}

testUltimateDrawerUpdates();
console.log('Ultimate drawer UI tests passed.');
