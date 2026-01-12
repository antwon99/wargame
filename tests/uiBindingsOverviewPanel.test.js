import assert from 'assert';
import { createStubDocument, createStubElement } from './helpers/domStubs.js';

async function testOverviewToggleUpdatesPanelState() {
    const originalDocument = global.document;
    try {
        const doc = createStubDocument();
        const overviewToggle = doc.register('btn-overview', createStubElement('button'));
        const overviewPanel = doc.register('overview-panel', createStubElement('div'));
        doc.body = createStubElement('body');
        doc.querySelectorAll = () => [];
        global.document = doc;

        const { setupUIBindings } = await import('../scripts/uiBindings.js');
        setupUIBindings({});

        overviewToggle.onclick();
        assert.strictEqual(overviewPanel.classList.contains('open'), true, 'overview panel should open');
        assert.strictEqual(overviewPanel.getAttribute('aria-hidden'), 'false', 'overview panel should be aria-visible');
        assert.strictEqual(overviewToggle.getAttribute('aria-expanded'), 'true', 'overview toggle should be expanded');

        overviewToggle.onclick();
        assert.strictEqual(overviewPanel.classList.contains('open'), false, 'overview panel should close');
        assert.strictEqual(overviewPanel.getAttribute('aria-hidden'), 'true', 'overview panel should be aria-hidden');
        assert.strictEqual(overviewToggle.getAttribute('aria-expanded'), 'false', 'overview toggle should collapse');
    } finally {
        global.document = originalDocument;
    }
}

async function testOverviewMandatesTriggerOpensTopBarPanel() {
    const originalDocument = global.document;
    try {
        const doc = createStubDocument();
        const mandatesTrigger = createStubElement('button');
        mandatesTrigger.id = 'btn-overview-mandates';
        const overviewToggle = doc.register('btn-overview', createStubElement('button'));
        const overviewPanel = doc.register('overview-panel', createStubElement('div'));
        const mandatesPanel = doc.register('mandates-panel', createStubElement('div'));
        doc.body = createStubElement('body');
        doc.querySelectorAll = (selector) => {
            if (selector === '[data-mandates-trigger]') return [mandatesTrigger];
            if (selector === '[data-reputation-trigger]') return [];
            return [];
        };
        global.document = doc;

        const { setupUIBindings } = await import('../scripts/uiBindings.js');
        setupUIBindings({});

        mandatesTrigger.onclick();
        assert.strictEqual(mandatesPanel.classList.contains('open'), true, 'mandates trigger should open the top bar panel');
        assert.strictEqual(overviewPanel.classList.contains('open'), false, 'overview panel should close after selection');
        assert.strictEqual(overviewPanel.getAttribute('aria-hidden'), 'true', 'overview panel should be aria-hidden');
        assert.strictEqual(overviewToggle.getAttribute('aria-expanded'), 'false', 'overview toggle should be collapsed');
    } finally {
        global.document = originalDocument;
    }
}

async function testOverviewReputationTriggerOpensTopBarPanel() {
    const originalDocument = global.document;
    try {
        const doc = createStubDocument();
        const reputationTrigger = createStubElement('button');
        reputationTrigger.id = 'btn-overview-reputation';
        const overviewToggle = doc.register('btn-overview', createStubElement('button'));
        const overviewPanel = doc.register('overview-panel', createStubElement('div'));
        const reputationPanel = doc.register('reputation-panel', createStubElement('div'));
        doc.body = createStubElement('body');
        doc.querySelectorAll = (selector) => {
            if (selector === '[data-mandates-trigger]') return [];
            if (selector === '[data-reputation-trigger]') return [reputationTrigger];
            return [];
        };
        global.document = doc;

        const { setupUIBindings } = await import('../scripts/uiBindings.js');
        setupUIBindings({});

        reputationTrigger.onclick();
        assert.strictEqual(reputationPanel.classList.contains('open'), true, 'reputation trigger should open the top bar panel');
        assert.strictEqual(overviewPanel.classList.contains('open'), false, 'overview panel should close after selection');
        assert.strictEqual(overviewPanel.getAttribute('aria-hidden'), 'true', 'overview panel should be aria-hidden');
        assert.strictEqual(overviewToggle.getAttribute('aria-expanded'), 'false', 'overview toggle should be collapsed');
    } finally {
        global.document = originalDocument;
    }
}

async function run() {
    await testOverviewToggleUpdatesPanelState();
    await testOverviewMandatesTriggerOpensTopBarPanel();
    await testOverviewReputationTriggerOpensTopBarPanel();
    console.log('UI bindings overview panel tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
