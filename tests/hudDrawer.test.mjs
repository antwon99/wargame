import assert from 'assert';
import { createHudDrawerController } from '../scripts/uiBindings.js';

function createStubElement(id = '') {
    const attributes = new Map();
    const el = {
        id,
        children: [],
        style: {},
        dataset: {},
        _innerHTML: '',
        classList: {
            _set: new Set(),
            add: (...tokens) => tokens.forEach(t => el.classList._set.add(t)),
            remove: (...tokens) => tokens.forEach(t => el.classList._set.delete(t)),
            contains: (token) => el.classList._set.has(token)
        },
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name); },
        contains(target) {
            if (target === el) return true;
            return this.children.some(child => typeof child.contains === 'function'
                ? child.contains(target)
                : child === target);
        },
        addEventListener: () => {}
    };
    Object.defineProperty(el, 'innerHTML', {
        get() { return this._innerHTML; },
        set(value) { this._innerHTML = value; this.children = []; }
    });
    return el;
}

function createStubDocument() {
    const elements = new Map();
    const listeners = {};
    const register = (id, el = createStubElement(id)) => { elements.set(id, el); return el; };
    return {
        body: register('body'),
        listeners,
        addEventListener: (event, cb) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(cb);
        },
        createElement: () => createStubElement(),
        getElementById: (id) => elements.get(id) || null,
        register
    };
}

function buildTemplates(document) {
    const upgrades = document.register('drawer-upgrades-template', createStubElement('drawer-upgrades-template'));
    upgrades.content = { cloneNode: () => document.register('upgrades-view', createStubElement('upgrades-view')) };
    const research = document.register('drawer-research-template', createStubElement('drawer-research-template'));
    research.content = { cloneNode: () => document.register('research-view', createStubElement('research-view')) };
}

function wireDrawerShell(document) {
    const drawer = document.register('hud-drawer', createStubElement('hud-drawer'));
    drawer.dataset = {};
    const content = document.register('hud-drawer-content', createStubElement('hud-drawer-content'));
    const body = document.register('hud-drawer-body', createStubElement('hud-drawer-body'));
    const close = document.register('hud-drawer-close', createStubElement('hud-drawer-close'));
    drawer.children.push(content, body, close);

    document.register('hud-drawer-eyebrow', createStubElement('hud-drawer-eyebrow'));
    document.register('hud-drawer-title', createStubElement('hud-drawer-title'));
    document.register('hud-drawer-subtitle', createStubElement('hud-drawer-subtitle'));
    document.register('hud-drawer-lives', createStubElement('hud-drawer-lives'));

    return { drawer, content, body };
}

function registerActionButtons(document) {
    const upg = document.register('btn-upg', createStubElement('btn-upg'));
    const research = document.register('btn-research', createStubElement('btn-research'));
    document.register('reclamation-hint', createStubElement('reclamation-hint'));
    ['buy-soldier', 'buy-archer', 'buy-prod', 'buy-mines', 'buy-defense'].forEach(id => document.register(id, createStubElement(id)));
    return { upg, research };
}

function resetGlobals(document, windowStub) {
    global.document = document;
    global.window = windowStub;
}

function restoreGlobals(originalDocument, originalWindow) {
    global.document = originalDocument;
    global.window = originalWindow;
}

function testHudDrawerController() {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const document = createStubDocument();
    const windowStub = { document };
    resetGlobals(document, windowStub);

    buildTemplates(document);
    const shell = wireDrawerShell(document);
    const actions = registerActionButtons(document);

    const game = {
        research: { lives: 0 },
        buyUpgradeCalls: [],
        buyUpgrade(type) { this.buyUpgradeCalls.push(type); },
        updateUpgradeMenuCalls: 0,
        updateUpgradeMenu() { this.updateUpgradeMenuCalls += 1; },
        updateResearchUI() { this.researchRefresh = true; }
    };

    const controller = createHudDrawerController(game);

    controller.showUpgrades();
    assert.ok(shell.drawer.classList.contains('open'), 'drawer should open for upgrades');
    assert.strictEqual(shell.content.children.length, 1, 'upgrade template should render into the drawer');
    assert.strictEqual(shell.drawer.getAttribute('aria-hidden'), 'false', 'drawer should announce visibility to assistive tech');
    assert.strictEqual(actions.upg.getAttribute('aria-expanded'), 'true', 'upgrade trigger should reflect open state');
    assert.strictEqual(actions.research.getAttribute('aria-expanded'), 'false', 'research trigger should be collapsed');
    assert.strictEqual(actions.upg.getAttribute('aria-controls'), 'hud-drawer', 'upgrade trigger should target the drawer shell');
    assert.strictEqual(actions.research.getAttribute('aria-controls'), 'hud-drawer', 'research trigger should target the drawer shell');

    const soldierBtn = document.getElementById('buy-soldier');
    soldierBtn.onclick?.();
    assert.deepStrictEqual(game.buyUpgradeCalls, ['soldier'], 'upgrade buttons should be rebound after rendering');

    controller.showResearch();
    assert.ok(shell.drawer.classList.contains('open'), 'drawer should stay open when swapping views');
    assert.strictEqual(shell.content.children.length, 1, 'content should be swapped instead of stacked');
    assert.strictEqual(shell.content.children[0].id, 'research-view', 'research content should replace upgrades');
    assert.strictEqual(actions.upg.getAttribute('aria-expanded'), 'false', 'upgrade trigger should collapse when research opens');
    assert.strictEqual(actions.research.getAttribute('aria-expanded'), 'true', 'research trigger should expand when active');

    const outsideTarget = createStubElement('outside');
    (document.listeners.click || []).forEach((handler) => handler({ target: outsideTarget }));
    assert.ok(!shell.drawer.classList.contains('open'), 'outside clicks should dismiss the drawer');
    assert.strictEqual(shell.drawer.getAttribute('aria-hidden'), 'true', 'drawer should hide from assistive tech after dismiss');

    controller.showUpgrades();
    (document.listeners.keydown || []).forEach((handler) => handler({ key: 'Escape' }));
    assert.ok(!shell.drawer.classList.contains('open'), 'escape key should close the drawer');

    controller.showUpgrades();
    const closeBtn = document.getElementById('hud-drawer-close');
    closeBtn.onclick?.();
    assert.ok(!shell.drawer.classList.contains('open'), 'close button should hide the drawer when tapped');

    restoreGlobals(originalDocument, originalWindow);
    console.log('HUD drawer controller tests passed.');
}

testHudDrawerController();
