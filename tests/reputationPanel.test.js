import assert from 'assert';
import fs from 'fs';

function createStubElement(tag = 'div') {
    const attributes = new Map();
    const element = {
        tag,
        children: [],
        className: '',
        style: {},
        _innerHTML: '',
        innerText: '',
        addEventListener() {},
        appendChild(child) { this.children.push(child); },
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name); }
    };

    element.classList = {
        _list: new Set(),
        add(...tokens) { tokens.forEach((token) => element.classList._list.add(token)); element.className = Array.from(element.classList._list).join(' '); },
        remove(...tokens) { tokens.forEach((token) => element.classList._list.delete(token)); element.className = Array.from(element.classList._list).join(' '); },
        toggle(token, force) {
            const shouldAdd = typeof force === 'boolean' ? force : !element.classList._list.has(token);
            if (shouldAdd) element.classList._list.add(token);
            else element.classList._list.delete(token);
            element.className = Array.from(element.classList._list).join(' ');
            return element.classList._list.has(token);
        },
        contains(token) { return element.classList._list.has(token); }
    };

    Object.defineProperty(element, 'innerHTML', {
        get() { return this._innerHTML; },
        set(value) {
            this._innerHTML = value;
            if (value === '') this.children = [];
        }
    });

    return element;
}

function createStubDocument() {
    const elements = new Map();
    return {
        createElement: (tag) => createStubElement(tag),
        getElementById: (id) => elements.get(id) || null,
        querySelectorAll: () => [],
        register: (id, el = createStubElement()) => { elements.set(id, el); return el; }
    };
}

async function testReputationPanelRender() {
    const originalDocument = global.document;
    try {
        const doc = createStubDocument();
        const body = doc.register('reputation-panel-body');
        global.document = doc;

        const { renderReputationPanel } = await import('../scripts/uiBindings.js');
        const rendered = renderReputationPanel({
            factionState: {
                standings: { crown: 72, reformers: 48, guilds: 60, masses: 35, frontier: 51 }
            },
            imperialFavor: 6,
            difficulty: 2,
            stats: { warsWon: 1, warsFought: 3 },
            overworld: { hexes: new Map() },
            timekeeper: { ticks: 12 }
        });

        assert.strictEqual(rendered.length, 5, 'panel should render five faction rows');
        assert.strictEqual(body.children.length, 1, 'panel body should receive a list wrapper');
        const [list] = body.children;
        assert.strictEqual(list.children.length, 5, 'list should contain five rows');
        const firstRow = list.children[0];
        assert.strictEqual(firstRow.children[0].children[0].innerText, 'Royalists', 'first row should label the crown faction');
        assert.strictEqual(firstRow.children[1].children[0].style.width, '72%', 'bar fill should use standing percentage');
        const tooltip = firstRow.getAttribute('title');
        assert.ok(tooltip.includes('Mandate compliance'), 'tooltip should mention mandate compliance');
        assert.ok(tooltip.includes('Tax pressure'), 'tooltip should mention tax pressure');
        assert.ok(tooltip.includes('War outcomes'), 'tooltip should mention war outcomes');
        assert.ok(tooltip.includes('Rebel suppression'), 'tooltip should mention rebel suppression');
    } finally {
        global.document = originalDocument;
    }
}

async function testReputationPanelToggleStates() {
    const originalDocument = global.document;
    try {
        const doc = createStubDocument();
        const panel = doc.register('reputation-panel');
        doc.register('reputation-panel-body');
        const btn = doc.register('btn-reputation', createStubElement('button'));
        global.document = doc;

        const { setupUIBindings } = await import('../scripts/uiBindings.js');
        setupUIBindings({});

        btn.onclick();
        assert.ok(panel.classList.contains('open'), 'panel should toggle open on first click');
        assert.strictEqual(panel.getAttribute('aria-hidden'), 'false', 'open panel should flip aria-hidden to false');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'true', 'trigger should mark expanded when panel opens');

        btn.onclick();
        assert.ok(!panel.classList.contains('open'), 'panel should close when clicking again');
        assert.strictEqual(panel.getAttribute('aria-hidden'), 'true', 'closing restores aria-hidden guard');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'false', 'trigger should broadcast collapse state');
    } finally {
        global.document = originalDocument;
    }
}

function testReputationPanelCssGuards() {
    const css = fs.readFileSync('style.css', 'utf8');
    assert.ok(css.includes('.reputation-panel {') && css.includes('transform: translateX(120%)'), 'closed panel should be translated off-screen by default');
    assert.ok(css.includes('.reputation-panel.open') && css.includes('transform: translateX(0);'), 'open class should reset transform to keep panel visible');
    assert.ok(css.includes('.reputation-panel {') && css.includes('pointer-events: none;'), 'panel container should allow clicks to pass through to the map');
    assert.ok(css.includes('.reputation-panel__inner') && css.includes('pointer-events: auto;'), 'panel inner content should remain interactive');
}

async function run() {
    await testReputationPanelRender();
    await testReputationPanelToggleStates();
    testReputationPanelCssGuards();
    console.log('Reputation panel UI tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
