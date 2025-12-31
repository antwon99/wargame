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
        const panel = doc.register('mandates-panel');
        const body = doc.register('mandates-panel-body');
        const btn = doc.register('btn-mandates', createStubElement('button'));

        global.document = doc;
        global.ImperialMandates = {
            describeDeadlineTick: () => ({ label: 'Month 1', remainingDays: 4 }),
            getActiveMandates: () => []
        };

        const { setupUIBindings } = await import('../scripts/uiBindings.js');
        setupUIBindings({});

        btn.onclick();
        assert.ok(panel.classList.contains('open'), 'panel should toggle open on first click');
        assert.strictEqual(panel.getAttribute('aria-hidden'), 'false', 'open panel should flip aria-hidden to false');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'true', 'trigger should mark expanded when panel opens');

        btn.onclick();
        assert.ok(!panel.classList.contains('open'), 'panel should close when clicking Tasks again');
        assert.strictEqual(panel.getAttribute('aria-hidden'), 'true', 'closing restores aria-hidden guard');
        assert.strictEqual(btn.getAttribute('aria-expanded'), 'false', 'trigger should broadcast collapse state');
    } finally {
        global.document = originalDocument;
        global.ImperialMandates = originalImperial;
    }
}

function testMandatesPanelTransformsAndPointerGuards() {
    const css = fs.readFileSync('style.css', 'utf8');
    assert.ok(css.includes('.mandates-panel {') && css.includes('transform: translateX(120%)'), 'closed mandates panel should be translated off-screen by default');
    assert.ok(css.includes('.mandates-panel.open') && css.includes('transform: translateX(0);'), 'open class should reset transform to keep panel visible');
    assert.ok(css.includes('pointer-events: none;') && css.includes('.mandates-panel__inner') && css.includes('pointer-events: auto;'), 'panel container should allow clicks to pass through to the map while inner content stays interactive');
    assert.ok(css.includes('width: min(300px, 92vw);'), 'panel should clamp width for smaller viewports');
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
    testMandatesPanelTransformsAndPointerGuards();
    await testRenderSurvivesDomRelocation();
    console.log('Mandates panel UI tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
