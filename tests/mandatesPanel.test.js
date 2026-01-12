import assert from 'assert';
import fs from 'fs';
import { createStubDocument, createStubElement } from './helpers/domStubs.js';

async function testMandatesPanelRendersList() {
    const originalDocument = global.document;
    const originalImperial = global.ImperialMandates;
    try {
        const doc = createStubDocument();
        const body = doc.register('mandates-panel-body');
        global.document = doc;
        global.ImperialMandates = {
            MandateStatus: { ACTIVE: 'ACTIVE', SUCCEEDED: 'SUCCEEDED' },
            describeDeadlineTick: (tick) => ({ label: `Month ${tick}`, remainingDays: tick - 2 }),
            confirmMandateResources: () => ({ ok: true }),
            getActiveMandates: () => [
                {
                    id: 'alpha',
                    title: 'Alpha Directive',
                    description: 'Push the frontier to the river.',
                    status: 'ACTIVE',
                    deadlineTick: 9,
                    resourceReady: true,
                    resourceConfirmed: false,
                    resourceRequirements: [{ key: 'gold', label: 'Coins', current: 80, target: 100, unit: 'coins' }]
                },
                {
                    id: 'beta',
                    title: 'Beta Cleanup',
                    description: 'Clear the remaining rebels.',
                    status: 'SUCCEEDED',
                    deadlineTick: 5
                }
            ]
        };

        const { renderMandatesPanel } = await import('../scripts/uiBindings.js');
        const rendered = renderMandatesPanel();

        assert.strictEqual(rendered.length, 2, 'all active mandates should be rendered');
        assert.strictEqual(body.children.length, 1, 'mandate list container should be added');
        const [list] = body.children;
        assert.strictEqual(list.children.length, 2, 'list should hold one card per mandate');

        const firstCard = list.children[0];
        const firstHeader = firstCard.children[0];
        assert.strictEqual(firstHeader.children[0].innerText, 'Alpha Directive', 'title should match mandate data');
        const firstBadge = firstHeader.children[1];
        assert.ok(firstBadge.className.includes('mandate-badge--active'), 'active mandate should show active badge');
        const resourceGroup = firstCard.children[2];
        assert.ok(resourceGroup.className.includes('mandate-card__resources'), 'resource summary should render for resource mandates');
        const resourceRow = resourceGroup.children[0];
        assert.ok(resourceRow.children[1].innerText.includes('80/100'), 'resource progress should show current and target values');
        const confirmButton = resourceGroup.children[1];
        assert.strictEqual(confirmButton.innerText, 'Send', 'resource-ready mandates should show a send button');

        const secondCard = list.children[1];
        const secondBadge = secondCard.children[0].children[1];
        assert.ok(secondBadge.className.includes('mandate-badge--completed'), 'completed mandate should show completed badge');
        const deadlineMeta = secondCard.children[2];
        assert.ok(deadlineMeta.children[0].innerText.includes('Month 5'), 'deadline label should use describeDeadlineTick helper');
        assert.ok(deadlineMeta.children[1].innerText.toLowerCase().includes('days'), 'remaining days readout should render');
    } finally {
        global.document = originalDocument;
        global.ImperialMandates = originalImperial;
    }
}

async function testMandatesPanelEmptyStateAndWarnings() {
    const originalDocument = global.document;
    const originalImperial = global.ImperialMandates;
    try {
        const doc = createStubDocument();
        const body = doc.register('mandates-panel-body');
        global.document = doc;
        global.ImperialMandates = {
            describeDeadlineTick: (tick) => ({ label: `Month ${tick}`, remainingDays: tick - 1 }),
            getActiveMandates: () => []
        };

        const { renderMandatesPanel } = await import('../scripts/uiBindings.js');
        const renderedEmpty = renderMandatesPanel();

        assert.strictEqual(renderedEmpty.length, 0, 'no mandates should return an empty list');
        assert.strictEqual(body.children.length, 1, 'empty state should render a single paragraph');
        assert.ok(body.children[0].innerText.includes('No active mandates'), 'empty copy should be clear to players');

        global.ImperialMandates.getActiveMandates = () => [{
            id: 'gamma',
            title: 'Gamma Warning',
            description: 'Finish before the fog closes in.',
            status: 'ACTIVE',
            deadlineTick: 2
        }];

        const renderedWarning = renderMandatesPanel();
        assert.strictEqual(renderedWarning.length, 1, 'mandate should render after data is available');
        const [list] = body.children;
        const badge = list.children[0].children[0].children[1];
        assert.ok(badge.className.includes('mandate-badge--warning'), 'warning badge should show when two days remain');
        const deadlineLabel = list.children[0].children[2].children[0];
        assert.ok(deadlineLabel.innerText.includes('Month 2'), 'deadline label should reflect describeDeadlineTick output');
    } finally {
        global.document = originalDocument;
        global.ImperialMandates = originalImperial;
    }
}

async function testMandatesPanelToggleStates() {
    const originalDocument = global.document;
    const originalImperial = global.ImperialMandates;
    try {
        const doc = createStubDocument();
        doc.body = createStubElement('body');
        doc.register('mandates-panel-body');
        const sidebar = doc.register('sidebar');
        const statsSection = doc.register('sidebar-section-stats');
        const tasksSection = doc.register('sidebar-section-tasks');
        doc.register('sidebar-section-standing');
        doc.register('sidebar-section-settings');
        doc.register('sidebar-tab-stats', createStubElement('button'));
        doc.register('sidebar-tab-tasks', createStubElement('button'));
        doc.register('sidebar-tab-standing', createStubElement('button'));
        doc.register('sidebar-tab-settings', createStubElement('button'));
        const btn = doc.register('btn-mandates', createStubElement('button'));
        doc.querySelectorAll = (selector) => {
            if (selector === '[data-mandates-trigger]') return [btn];
            if (selector === '[data-reputation-trigger]') return [];
            return [];
        };

        global.document = doc;
        global.ImperialMandates = {
            describeDeadlineTick: () => ({ label: 'Month 1', remainingDays: 4 }),
            getActiveMandates: () => []
        };

        const { setupUIBindings } = await import('../scripts/uiBindings.js');
        setupUIBindings({});

        btn.onclick();
        assert.ok(sidebar.classList.contains('open'), 'sidebar should open on first click');
        assert.ok(tasksSection.classList.contains('is-active'), 'tasks section should become active');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'true', 'trigger should mark expanded when section opens');

        btn.onclick();
        assert.ok(!sidebar.classList.contains('open'), 'sidebar should close when clicking Tasks again');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'false', 'trigger should broadcast collapse state');
        assert.ok(tasksSection.classList.contains('is-active'), 'tasks section should remain selected after closing');
        assert.ok(!statsSection.classList.contains('is-active'), 'stats section should not be active after task selection');
    } finally {
        global.document = originalDocument;
        global.ImperialMandates = originalImperial;
    }
}

async function testMandatesPanelClosesReputationPanel() {
    const originalDocument = global.document;
    const originalImperial = global.ImperialMandates;
    try {
        const doc = createStubDocument();
        doc.body = createStubElement('body');
        doc.register('mandates-panel-body');
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

        reputationBtn.onclick();
        assert.ok(sidebar.classList.contains('open'), 'sidebar should open on click');
        assert.ok(standingSection.classList.contains('is-active'), 'standing section should become active');
        assert.strictEqual(reputationBtn.getAttribute('aria-expanded'), 'true', 'standing trigger should expand');
        assert.strictEqual(mandatesBtn.getAttribute('aria-expanded'), 'false', 'mandates trigger should remain collapsed');

        mandatesBtn.onclick();
        assert.ok(tasksSection.classList.contains('is-active'), 'tasks section should become active');
        assert.strictEqual(mandatesBtn.getAttribute('aria-expanded'), 'true', 'mandates trigger should expand');
        assert.strictEqual(reputationBtn.getAttribute('aria-expanded'), 'false', 'standing trigger should collapse');
    } finally {
        global.document = originalDocument;
        global.ImperialMandates = originalImperial;
    }
}

function testMandatesPanelTransformsAndPointerGuards() {
    const css = fs.readFileSync('style.css', 'utf8');
    assert.ok(css.includes('.sidebar-tabs'), 'sidebar tabs should be styled for section switching');
    assert.ok(css.includes('.sidebar-section.is-active'), 'sidebar sections should define an active state');
    assert.ok(css.includes('.mandates-panel__inner'), 'mandates panel styling should stay available inside the sidebar');
}

async function testRenderSurvivesDomRelocation() {
    const originalDocument = global.document;
    const originalImperial = global.ImperialMandates;
    try {
        const doc = createStubDocument();
        const firstBody = doc.register('mandates-panel-body');
        global.document = doc;
        global.ImperialMandates = {
            describeDeadlineTick: (tick) => ({ label: `Month ${tick}`, remainingDays: tick - 1 }),
            getActiveMandates: () => [{ id: 'delta', title: 'Delta', description: 'Hold the line.', deadlineTick: 3 }]
        };

        const { renderMandatesPanel } = await import('../scripts/uiBindings.js');
        renderMandatesPanel();
        assert.strictEqual(firstBody.children.length, 1, 'initial body should receive rendered content');

        const relocatedBody = createStubElement('section');
        doc.register('mandates-panel-body', relocatedBody);

        renderMandatesPanel();
        const renderedTitle = relocatedBody.children[0]?.children[0]?.children[0]?.children[0]?.innerText;
        assert.strictEqual(relocatedBody.children.length, 1, 'render should target the relocated body');
        assert.ok(renderedTitle?.includes('Delta'), 'bindings should persist after relocation');
    } finally {
        global.document = originalDocument;
        global.ImperialMandates = originalImperial;
    }
}

async function run() {
    await testMandatesPanelRendersList();
    await testMandatesPanelEmptyStateAndWarnings();
    await testMandatesPanelToggleStates();
    await testMandatesPanelClosesReputationPanel();
    testMandatesPanelTransformsAndPointerGuards();
    await testRenderSurvivesDomRelocation();
    console.log('Mandates panel UI tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
