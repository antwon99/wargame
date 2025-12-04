const assert = require('assert');

async function loadStackModule() {
    return import('../scripts/notificationStack.js');
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

async function run() {
    await testQueueingAndAutoDismiss();
    console.log('Notification stack tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
