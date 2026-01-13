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
        doc.body = createStubElement('body');
        doc.register('reputation-panel');
        doc.register('reputation-panel-body');
        const sidebar = doc.register('sidebar');
        const btn = doc.register('btn-reputation', createStubElement('button'));
        doc.querySelectorAll = (selector) => {
            if (selector === '[data-mandates-trigger]') return [];
            if (selector === '[data-reputation-trigger]') return [btn];
            return [];
        };
        global.document = doc;

        const { setupUIBindings } = await import('../scripts/uiBindings.js');
        setupUIBindings({});

        btn.onclick();
        const panel = doc.getElementById('reputation-panel');
        assert.ok(panel.classList.contains('open'), 'reputation flyout should open on click');
        assert.strictEqual(panel.getAttribute('aria-hidden'), 'false', 'reputation flyout should be visible to assistive tech');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'true', 'trigger should mark expanded when flyout opens');
        assert.ok(!sidebar.classList.contains('open'), 'sidebar should remain closed when opening reputation');

        btn.onclick();
        assert.ok(!panel.classList.contains('open'), 'reputation flyout should close on second click');
        assert.strictEqual(panel.getAttribute('aria-hidden'), 'true', 'reputation flyout should be hidden to assistive tech');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'false', 'trigger should broadcast collapse state');
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
        doc.register('mandates-panel');
        doc.register('mandates-panel-body');
        doc.register('reputation-panel');
        doc.register('reputation-panel-body');
        const sidebar = doc.register('sidebar');
        const mandatesBtn = doc.register('btn-mandates', createStubElement('button'));
        const reputationBtn = doc.register('btn-reputation', createStubElement('button'));
        doc.querySelectorAll = (selector) => {
            if (selector === '[data-mandates-trigger]') return [mandatesBtn];
            if (selector === '[data-reputation-trigger]') return [reputationBtn];
            return [];
        };
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
        const mandatesPanel = doc.getElementById('mandates-panel');
        const reputationPanel = doc.getElementById('reputation-panel');
        assert.ok(mandatesPanel.classList.contains('open'), 'mandates flyout should open on click');
        assert.strictEqual(mandatesBtn.getAttribute('aria-expanded'), 'true', 'mandates trigger should expand');
        assert.strictEqual(reputationBtn.getAttribute('aria-expanded'), 'false', 'standing trigger should remain collapsed');
        assert.ok(!reputationPanel.classList.contains('open'), 'reputation flyout should remain closed');
        assert.ok(!sidebar.classList.contains('open'), 'sidebar should remain closed when opening mandates');

        reputationBtn.onclick();
        assert.ok(reputationPanel.classList.contains('open'), 'reputation flyout should open when toggled');
        assert.strictEqual(reputationBtn.getAttribute('aria-expanded'), 'true', 'standing trigger should expand');
        assert.strictEqual(mandatesBtn.getAttribute('aria-expanded'), 'false', 'mandates trigger should collapse');
        assert.ok(!mandatesPanel.classList.contains('open'), 'mandates flyout should close when reputation opens');
    } finally {
        global.document = originalDocument;
        global.ImperialMandates = originalImperial;
    }
}

async function testReputationPanelDesktopFlyoutToggle() {
    const originalDocument = global.document;
    const originalWindow = global.window;
    try {
        const doc = createStubDocument();
        doc.body = createStubElement('body');
        doc.register('reputation-panel');
        doc.register('reputation-panel-body');
        const sidebar = doc.register('sidebar');
        const btn = doc.register('btn-reputation', createStubElement('button'));
        doc.querySelectorAll = (selector) => {
            if (selector === '[data-mandates-trigger]') return [];
            if (selector === '[data-reputation-trigger]') return [btn];
            return [];
        };
        global.document = doc;
        global.window = { innerWidth: 1200 };

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

        btn.onclick();
        const panel = doc.getElementById('reputation-panel');
        assert.ok(panel.classList.contains('open'), 'reputation flyout should open on desktop');
        assert.strictEqual(panel.getAttribute('aria-hidden'), 'false', 'panel should be visible to assistive tech');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'true', 'trigger should mark expanded for flyout');
        assert.ok(!sidebar.classList.contains('open'), 'sidebar should remain closed on desktop');

        btn.onclick();
        assert.ok(!panel.classList.contains('open'), 'reputation flyout should close on second click');
        assert.strictEqual(panel.getAttribute('aria-hidden'), 'true', 'panel should be hidden to assistive tech');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'false', 'trigger should mark collapsed for flyout');
    } finally {
        global.document = originalDocument;
        global.window = originalWindow;
    }
}

function testReputationPanelCssGuards() {
    const css = fs.readFileSync('style.css', 'utf8');
    assert.ok(css.includes('.reputation-panel__inner'), 'reputation panel styling should stay available for flyouts');
    assert.ok(css.includes('.hud-panel.open'), 'hud panels should expose an open state for flyouts');
    assert.ok(css.includes('.sidebar-tab.is-active'), 'sidebar tabs should have an active state');
    assert.ok(css.includes('.sidebar-section.is-active'), 'sidebar sections should define an active state');
}

async function run() {
    await testReputationPanelRender();
    await testReputationPanelToggleStates();
    await testReputationPanelClosesMandatesPanel();
    await testReputationPanelDesktopFlyoutToggle();
    testReputationPanelCssGuards();
    console.log('Reputation panel UI tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
