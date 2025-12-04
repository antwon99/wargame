const assert = require('assert');

function createStubElement(tag = 'div') {
    const element = {
        tag,
        children: [],
        className: '',
        style: {},
        _innerHTML: '',
        innerText: '',
        appendChild(child) { this.children.push(child); },
        setAttribute() {}
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
        register: (id, el = createStubElement()) => { elements.set(id, el); return el; }
    };
}

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
            getActiveMandates: () => [
                {
                    id: 'alpha',
                    title: 'Alpha Directive',
                    description: 'Push the frontier to the river.',
                    status: 'ACTIVE',
                    deadlineTick: 9
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

async function run() {
    await testMandatesPanelRendersList();
    await testMandatesPanelEmptyStateAndWarnings();
    console.log('Mandates panel UI tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
