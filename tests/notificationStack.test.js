const assert = require('assert');

async function loadStackModule() {
    return import('../scripts/notificationStack.js');
}

function createStubElement(id = null) {
    const element = {
        id,
        children: [],
        className: '',
        dataset: {},
        style: { setProperty(name, value) { this[name] = String(value); } },
        innerText: '',
        appendChild(child) { this.children.push(child); child.parentNode = this; },
        setAttribute() {},
        addEventListener() {},
        remove() {}
    };
    const classes = new Set();
    element.classList = {
        add: (...tokens) => tokens.forEach((t) => classes.add(t)),
        remove: (...tokens) => tokens.forEach((t) => classes.delete(t)),
        contains: (token) => classes.has(token),
        toggle: (token, force) => {
            if (force === undefined) {
                if (classes.has(token)) { classes.delete(token); return false; }
                classes.add(token); return true;
            }
            if (force) { classes.add(token); return true; }
            classes.delete(token); return false;
        }
    };
    return element;
}

function createStubDocument() {
    const elements = new Map();
    const body = createStubElement('body');
    return {
        body,
        createElement: () => createStubElement(),
        getElementById: (id) => elements.get(id) || null,
        registerElement: (id, el) => { elements.set(id, el); return el; }
    };
}

async function testQueueingAndAutoDismiss() {
    const { NotificationStack } = await loadStackModule();
    const stack = new NotificationStack({ maxVisible: 2, autoDismissMs: 20, registerGlobal: false });

    const first = stack.enqueue({ title: 'First', lines: ['alpha'], duration: 20 });
    stack.enqueue({ title: 'Second', lines: ['bravo'], duration: 20 });
    stack.enqueue({ title: 'Third', lines: ['charlie'], duration: 20 });

    assert.strictEqual(stack.visible.size, 2, 'stack should cap visible items');
    assert.strictEqual(stack.queue.length, 1, 'excess items should queue');

    stack.dismiss(first);
    stack.flush();

    assert.strictEqual(stack.visible.size, 2, 'dismissing should promote queued items');

    await new Promise((resolve) => setTimeout(resolve, 45));

    assert.strictEqual(stack.visible.size, 0, 'auto-dismiss should clear visible cards');
    assert.strictEqual(stack.queue.length, 0, 'queue should empty after dismissals');
}

async function testIntroOverlayGuard() {
    const { NotificationStack } = await loadStackModule();
    const doc = createStubDocument();
    const overlay = doc.registerElement('intro-overlay', createStubElement('intro-overlay'));
    const stack = new NotificationStack({
        maxVisible: 1,
        autoDismissMs: 10,
        registerGlobal: false,
        document: doc
    });

    assert.ok(stack.container.classList.contains('notification-stack--blocked'), 'stack should block pointer events while overlay is active');

    overlay.classList.add('intro-hidden');
    stack.syncIntroOverlayGuards();
    assert.ok(!stack.container.classList.contains('notification-stack--blocked'), 'stack should reactivate once overlay hides');
}

async function testAutoPromotionAfterScheduledDismiss() {
    const { NotificationStack } = await loadStackModule();
    const stack = new NotificationStack({ maxVisible: 1, autoDismissMs: 12, registerGlobal: false });

    stack.enqueue({ id: 'first', title: 'First', duration: 10 });
    stack.enqueue({ id: 'second', title: 'Second', duration: 14 });

    assert.strictEqual(stack.visible.size, 1, 'only the first notification should render initially');
    assert.strictEqual(stack.queue.length, 1, 'second notification should queue until space frees up');

    await new Promise((resolve) => setTimeout(resolve, 18));
    assert.ok(stack.visible.has('second'), 'second notification should auto-promote after the first dismisses');
    assert.strictEqual(stack.queue.length, 0, 'queue should be empty after the auto-promotion');

    await new Promise((resolve) => setTimeout(resolve, 18));
    assert.strictEqual(stack.visible.size, 0, 'scheduled dismiss should also clear the promoted notification');
}

async function run() {
    await testQueueingAndAutoDismiss();
    await testIntroOverlayGuard();
    await testAutoPromotionAfterScheduledDismiss();
    console.log('Notification stack tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
