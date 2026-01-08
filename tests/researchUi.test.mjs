import assert from 'assert';
import { updateResearchUI } from '../scripts/uiBindings.js';
import { ResearchSystem } from '../scripts/researchSystem.js';

ResearchSystem.initResearchSystem?.(globalThis);

class StubClassList {
    constructor() {
        this._set = new Set();
    }

    add(...tokens) {
        tokens.forEach((token) => this._set.add(token));
    }

    remove(...tokens) {
        tokens.forEach((token) => this._set.delete(token));
    }

    toggle(token, force) {
        if (force === true) {
            this.add(token);
            return true;
        }
        if (force === false) {
            this.remove(token);
            return false;
        }
        if (this._set.has(token)) {
            this._set.delete(token);
            return false;
        }
        this._set.add(token);
        return true;
    }

    contains(token) {
        return this._set.has(token);
    }

    toString() {
        return Array.from(this._set).join(' ');
    }
}

class StubElement {
    constructor(tag = 'div') {
        this.tagName = tag.toLowerCase();
        this.children = [];
        this.parentElement = null;
        this.attributes = new Map();
        this.dataset = {};
        this.style = {};
        this.classList = new StubClassList();
        this._innerText = '';
        this._innerHTML = '';
        this.id = '';
        this.title = '';
        this.disabled = false;
        this.hidden = false;
    }

    appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
        return child;
    }

    setAttribute(name, value) {
        if (name === 'id') this.id = value;
        this.attributes.set(name, value);
    }

    getAttribute(name) {
        if (name === 'id') return this.id;
        return this.attributes.get(name);
    }

    querySelectorAll(selector) {
        const results = [];
        const isClass = selector.startsWith('.');
        const isTag = !isClass && !selector.includes('[') && !selector.startsWith('#');
        const className = isClass ? selector.slice(1) : null;

        const walk = (node) => {
            if (isClass && node.classList.contains(className)) {
                results.push(node);
            } else if (isTag && node.tagName === selector.toLowerCase()) {
                results.push(node);
            }
            node.children.forEach(walk);
        };

        walk(this);
        return results;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    contains(target) {
        if (target === this) return true;
        return this.children.some((child) => child.contains?.(target));
    }

    get innerText() {
        return this._innerText;
    }

    set innerText(value) {
        this._innerText = value;
    }

    get innerHTML() {
        return this._innerHTML;
    }

    set innerHTML(value) {
        this._innerHTML = value;
        this.children = [];
    }

    get className() {
        return this.classList.toString();
    }

    set className(value) {
        this.classList = new StubClassList();
        value.split(/\s+/).filter(Boolean).forEach((token) => this.classList.add(token));
    }
}

class StubDocument {
    constructor() {
        this.nodes = new Map();
    }

    createElement(tag) {
        return new StubElement(tag);
    }

    getElementById(id) {
        return this.nodes.get(id) || null;
    }

    register(id, element = new StubElement()) {
        element.id = id;
        this.nodes.set(id, element);
        return element;
    }
}

function buildGame(resources) {
    const leveledTech = {
        id: 'scaled-tech',
        name: 'Scaled Tech',
        description: 'Scales over multiple purchases.',
        cost: { gold: 150 },
        growthFactor: 1.35,
        maxPurchases: 3,
        timesPurchased: 0
    };
    const singleUnlock = {
        id: 'one-shot',
        name: 'One Shot',
        description: 'Single unlock example.',
        cost: { gold: 50 },
        maxPurchases: 1,
        timesPurchased: 1,
        purchased: true
    };
    const techs = [leveledTech, singleUnlock];

    const game = {
        resources: { ...resources },
        research: { lives: 1, technologies: techs },
        buyTechnologyCalls: [],
        hasFieldToConvert: () => true,
        getTech: (id) => techs.find((t) => t.id === id) || null,
        getTechCost: (tech, optionId) => ResearchSystem.getCostForTech(tech, optionId),
        formatCost: (cost) => Object.entries(cost || {})
            .map(([key, value]) => `${value}${key[0]}`)
            .join(' + '),
        canPayCost(cost) {
            return Object.entries(cost || {}).every(([key, value]) => (this.resources[key] || 0) >= value);
        },
        buyTechnology(id) {
            this.buyTechnologyCalls.push(id);
        }
    };

    return game;
}

function testScalingHintAndPurchaseStates() {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const originalResearchSystem = global.ResearchSystem;
    const document = new StubDocument();
    const grid = document.register('tech-grid', new StubElement('div'));
    global.document = document;
    global.window = { document };
    global.ResearchSystem = ResearchSystem;

    const game = buildGame({ gold: 500, wood: 200 });

    updateResearchUI(game);

    const findCardByTitle = (title) => grid.children.find((child) => child.querySelector('.tech-title')?.innerText === title);

    const scaledCard = findCardByTitle('Scaled Tech (0/3)');
    assert.ok(scaledCard, 'leveled tech card should render');
    const scaleLine = scaledCard.querySelector('.tech-scale');
    assert.ok(scaleLine, 'leveled tech should include a scaling hint');
    assert.strictEqual(scaleLine.innerText, 'Scales ×1.35 per purchase.', 'scaling hint should mirror growthFactor');

    const purchaseBtn = scaledCard.querySelector('.tech-purchase-btn');
    assert.ok(purchaseBtn.classList.contains('affordable'), 'affordable tech should style the purchase button');

    const singleCard = findCardByTitle('One Shot');
    assert.ok(singleCard, 'single-purchase tech card should render');
    assert.ok(!singleCard.querySelector('.tech-scale'), 'one-time unlock should not render scaling hint');
    const singleBtn = singleCard.querySelector('.tech-purchase-btn');
    assert.strictEqual(singleBtn.innerText, 'Purchased', 'purchased tech should show purchased state on the button');
    assert.ok(singleBtn.disabled, 'purchased tech should disable its button');
    assert.ok(singleBtn.classList.contains('purchased-btn'), 'purchased tech should style the button as purchased');

    global.document = originalDocument;
    global.window = originalWindow;
    global.ResearchSystem = originalResearchSystem;
}

function testLandReclamationOptionStates() {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const originalResearchSystem = global.ResearchSystem;
    const document = new StubDocument();
    const grid = document.register('tech-grid', new StubElement('div'));
    global.document = document;
    global.window = { document };
    global.ResearchSystem = ResearchSystem;

    const landTech = {
        id: 'land-reclamation',
        name: 'Land Reclamation',
        description: 'Spend gold to reclaim a field of your choice into a forest or town.',
        costOptions: [
            { id: 'forest', label: 'Plant Forest', cost: { gold: 500 } },
            { id: 'town', label: 'Raise City', cost: { gold: 500 } }
        ],
        growthFactor: 1.35,
        timesPurchased: 1,
        optionPurchaseCounts: { forest: 1, town: 1 }
    };
    const game = {
        resources: { gold: 700 },
        research: { lives: 1, technologies: [landTech] },
        hasFieldToConvert: () => true,
        getTech: () => landTech,
        getTechCost: (tech, optionId) => ResearchSystem.getCostForTech(tech, optionId),
        formatCost: (cost) => Object.entries(cost || {})
            .map(([key, value]) => `${value}${key[0]}`)
            .join(' + '),
        canPayCost(cost) {
            return Object.entries(cost || {}).every(([key, value]) => (this.resources[key] || 0) >= value);
        },
        buyTechnologyCalls: [],
        buyTechnology(id) {
            this.buyTechnologyCalls.push(id);
        }
    };

    updateResearchUI(game);

    const card = grid.children[0];
    const optionButtons = card.querySelectorAll('.option-btn');
    assert.strictEqual(optionButtons.length, 2, 'land reclamation should render two option buttons');
    assert.strictEqual(
        optionButtons[0].querySelector('.option-btn__label')?.innerText,
        'Plant Forest',
        'forest option should show the action label'
    );
    assert.strictEqual(
        optionButtons[1].querySelector('.option-btn__label')?.innerText,
        'Raise City',
        'town option should show the action label'
    );

    const purchaseBtn = card.querySelector('.tech-purchase-btn');
    assert.ok(purchaseBtn.disabled, 'purchase button should stay disabled until an option is selected');
    assert.ok(purchaseBtn.hidden, 'purchase button should stay hidden until an option is selected');

    optionButtons[0].onclick();

    assert.strictEqual(
        optionButtons[0].querySelector('.option-btn__price')?.innerText,
        '675g',
        'selected option should show the scaled price'
    );
    assert.ok(optionButtons[0].classList.contains('option-btn--selected'), 'selected option should be marked as selected');
    assert.ok(optionButtons[0].classList.contains('active'), 'selected option should keep the active class');
    assert.ok(optionButtons[0].classList.contains('confirm'), 'selected option should add the confirm class');
    assert.ok(optionButtons[0].classList.contains('affordable'), 'selected option should reflect affordability styling');
    assert.strictEqual(
        optionButtons[1].querySelector('.option-btn__label')?.innerText,
        'Raise City',
        'unselected option should keep its label'
    );
    assert.ok(!optionButtons[1].classList.contains('affordable'), 'unselected option should not show affordability styling');

    assert.strictEqual(purchaseBtn.innerText, 'Confirm', 'purchase button should show a confirm label');
    assert.ok(!purchaseBtn.disabled, 'purchase button should enable when the selected option is affordable');
    assert.ok(!purchaseBtn.hidden, 'purchase button should show when the selected option is affordable');

    game.resources.gold = 500;
    updateResearchUI(game);
    const updatedCard = grid.children[0];
    const updatedOptionButtons = updatedCard.querySelectorAll('.option-btn');
    updatedOptionButtons[0].onclick();
    assert.ok(updatedOptionButtons[0].classList.contains('unaffordable'), 'unaffordable selected option should carry styling state');
    const updatedPurchaseBtn = updatedCard.querySelector('.tech-purchase-btn');
    assert.ok(updatedPurchaseBtn.disabled, 'purchase button should disable when the selected option is unaffordable');
    assert.ok(updatedPurchaseBtn.hidden, 'purchase button should hide when the selected option is unaffordable');

    global.document = originalDocument;
    global.window = originalWindow;
    global.ResearchSystem = originalResearchSystem;
}

testScalingHintAndPurchaseStates();
testLandReclamationOptionStates();
console.log('Research UI rendering tests passed.');
