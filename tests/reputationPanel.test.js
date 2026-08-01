import assert from 'assert';
import fs from 'fs';
import { createStubDocument, createStubElement } from './helpers/domStubs.js';

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
        const close = doc.register('btn-reputation-close', createStubElement('button'));
        btn.focus = () => { doc.activeElement = btn; };
        close.focus = () => { doc.activeElement = close; };
        panel.contains = (element) => element === close;
        doc.activeElement = btn;
        global.document = doc;

        const { setupUIBindings } = await import('../scripts/uiBindings.js');
        setupUIBindings({});

        btn.onclick();
        assert.ok(panel.classList.contains('open'), 'panel should toggle open on first click');
        assert.strictEqual(panel.getAttribute('aria-hidden'), 'false', 'open panel should flip aria-hidden to false');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'true', 'trigger should mark expanded when panel opens');
        assert.strictEqual(doc.activeElement, close, 'opening should focus the panel close control');
        assert.strictEqual(panel.style.display, 'block', 'opening should expose the panel to keyboard focus');

        (doc.listeners.keydown || []).forEach((handler) => handler({ key: 'Escape' }));
        assert.ok(!panel.classList.contains('open'), 'panel should close when clicking again');
        assert.strictEqual(panel.getAttribute('aria-hidden'), 'true', 'closing restores aria-hidden guard');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'false', 'trigger should broadcast collapse state');
        assert.strictEqual(panel.style.display, 'none', 'closing should remove descendants from keyboard navigation');
        assert.strictEqual(doc.activeElement, btn, 'escape should restore focus to the reputation trigger');

        btn.onclick();
        close.onclick();
        assert.strictEqual(doc.activeElement, btn, 'close button should restore focus to the reputation trigger');
    } finally {
        global.document = originalDocument;
    }
}

async function testReputationPanelClosesMandatesPanel() {
    const originalDocument = global.document;
    const originalImperial = global.ImperialMandates;
    try {
        const doc = createStubDocument();
        doc.body = createStubElement('body');
        const mandatesPanel = doc.register('mandates-panel');
        doc.register('mandates-panel-body');
        const reputationPanel = doc.register('reputation-panel');
        doc.register('reputation-panel-body');
        const mandatesBtn = doc.register('btn-mandates', createStubElement('button'));
        const reputationBtn = doc.register('btn-reputation', createStubElement('button'));
        global.document = doc;
        global.ImperialMandates = {
            describeDeadlineTick: () => ({ label: 'Month 1', remainingDays: 4 }),
            getActiveMandates: () => []
        };

        const { setupUIBindings } = await import('../scripts/uiBindings.js');
        const game = {
            factionState: { standings: {} },
            imperialFavor: 5,
            difficulty: 1,
            stats: { warsWon: 0, warsFought: 0 },
            overworld: { hexes: new Map() },
            timekeeper: { ticks: 1 }
        };
        setupUIBindings(game);

        mandatesBtn.onclick();
        assert.ok(mandatesPanel.classList.contains('open'), 'mandates panel should open on click');

        reputationBtn.onclick();
        assert.ok(reputationPanel.classList.contains('open'), 'reputation panel should open when clicked');
        assert.ok(!mandatesPanel.classList.contains('open'), 'mandates panel should close when reputation opens');
    } finally {
        global.document = originalDocument;
        global.ImperialMandates = originalImperial;
    }
}

function testReputationPanelCssGuards() {
    const css = fs.readFileSync('style.css', 'utf8');
    assert.ok(css.includes('.hud-flyout-panel {') && css.includes('transform: translateX(120%)'), 'closed panel should be translated off-screen by default');
    assert.ok(css.includes('.reputation-panel.open') && css.includes('transform: translateX(0);'), 'open class should reset transform to keep panel visible');
    assert.ok(css.includes('.hud-flyout-panel {') && css.includes('pointer-events: none;'), 'panel container should allow clicks to pass through to the map');
    assert.ok(css.includes('.reputation-panel__inner') && css.includes('pointer-events: auto;'), 'panel inner content should remain interactive');
}

async function run() {
    await testReputationPanelRender();
    await testReputationPanelToggleStates();
    await testReputationPanelClosesMandatesPanel();
    testReputationPanelCssGuards();
    console.log('Reputation panel UI tests passed.');
}

await run();
