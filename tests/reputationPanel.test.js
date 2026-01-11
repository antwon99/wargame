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
        const panel = doc.register('reputation-panel');
        doc.register('reputation-panel-body');
        const sidebar = doc.register('sidebar');
        doc.register('sidebar-section-stats');
        doc.register('sidebar-section-tasks');
        const standingSection = doc.register('sidebar-section-standing');
        doc.register('sidebar-section-settings');
        doc.register('sidebar-tab-stats', createStubElement('button'));
        doc.register('sidebar-tab-tasks', createStubElement('button'));
        doc.register('sidebar-tab-standing', createStubElement('button'));
        doc.register('sidebar-tab-settings', createStubElement('button'));
        const btn = doc.register('btn-reputation', createStubElement('button'));
        global.document = doc;

        const { setupUIBindings } = await import('../scripts/uiBindings.js');
        setupUIBindings({});

        btn.onclick();
        assert.ok(sidebar.classList.contains('open'), 'sidebar should open on first click');
        assert.ok(standingSection.classList.contains('is-active'), 'standing section should become active');
        assert.strictEqual(panel.getAttribute('aria-hidden'), 'false', 'open sidebar should unhide panel');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'true', 'trigger should mark expanded when section opens');

        btn.onclick();
        assert.ok(!sidebar.classList.contains('open'), 'sidebar should close when clicking again');
        assert.strictEqual(panel.getAttribute('aria-hidden'), 'true', 'closing restores aria-hidden guard');
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
        const mandatesPanel = doc.register('mandates-panel');
        doc.register('mandates-panel-body');
        const reputationPanel = doc.register('reputation-panel');
        doc.register('reputation-panel-body');
        const sidebar = doc.register('sidebar');
        const tasksSection = doc.register('sidebar-section-tasks');
        const standingSection = doc.register('sidebar-section-standing');
        doc.register('sidebar-section-stats');
        doc.register('sidebar-section-settings');
        doc.register('sidebar-tab-stats', createStubElement('button'));
        doc.register('sidebar-tab-tasks', createStubElement('button'));
        doc.register('sidebar-tab-standing', createStubElement('button'));
        doc.register('sidebar-tab-settings', createStubElement('button'));
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
        assert.ok(sidebar.classList.contains('open'), 'sidebar should open on click');
        assert.ok(tasksSection.classList.contains('is-active'), 'tasks section should become active');
        assert.strictEqual(mandatesPanel.getAttribute('aria-hidden'), 'false', 'mandates panel should be visible');

        reputationBtn.onclick();
        assert.ok(standingSection.classList.contains('is-active'), 'standing section should become active');
        assert.strictEqual(reputationPanel.getAttribute('aria-hidden'), 'false', 'reputation panel should be visible');
        assert.strictEqual(mandatesPanel.getAttribute('aria-hidden'), 'true', 'mandates panel should be hidden');
    } finally {
        global.document = originalDocument;
        global.ImperialMandates = originalImperial;
    }
}

function testReputationPanelCssGuards() {
    const css = fs.readFileSync('style.css', 'utf8');
    assert.ok(css.includes('.sidebar .hud-flyout-panel'), 'sidebar should override flyout panel layout');
    assert.ok(css.includes('.sidebar-tab.is-active'), 'sidebar tabs should have an active state');
    assert.ok(css.includes('.sidebar-section.is-active'), 'sidebar sections should define an active state');
}

async function run() {
    await testReputationPanelRender();
    await testReputationPanelToggleStates();
    await testReputationPanelClosesMandatesPanel();
    testReputationPanelCssGuards();
    console.log('Reputation panel UI tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
