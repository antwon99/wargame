const assert = require('assert');

function createStubImperialApi() {
    const calls = [];
    return {
        calls,
        api: {
            recordEvent(event, payload, gameState, uiBindings) {
                calls.push({ event, payload, gameState, uiBindings });
            }
        }
    };
}

function loadManagerWithStub(stub) {
    delete require.cache[require.resolve('../scripts/mandates/imperialMandateManager.js')];
    global.ImperialMandates = stub.api;
    const manager = require('../scripts/mandates/imperialMandateManager.js');
    manager.initImperialMandateManager?.(global);
    return manager;
}

async function testTickSpacingAndBindingCache() {
    const stub = createStubImperialApi();
    const manager = loadManagerWithStub(stub);
    manager.reset();

    const game = { label: 'state' };
    const bindingsA = { enqueueNotification: () => 'queued' };
    const bindingsB = { renderMandates: () => 'rendered' };

    manager.advanceTick(game, bindingsA);
    manager.advanceTick(game, bindingsB);
    manager.advanceTick(game, {});

    assert.strictEqual(stub.calls.length, 0, 'ticks should be deferred until the scheduled flush');
    await new Promise((resolve) => setTimeout(resolve, 5));

    assert.strictEqual(stub.calls.length, 1, 'queued ticks should flush in a single batch');
    const call = stub.calls[0];
    assert.strictEqual(call.event, 'tick');
    assert.strictEqual(call.payload.ticks, 3, 'batched ticks should reflect the number of calls');
    assert.strictEqual(call.payload.gameState, game);
    assert.strictEqual(call.gameState, game, 'gameState should be forwarded for mandate predicates');
    assert.ok(call.uiBindings.enqueueNotification);
    assert.ok(call.uiBindings.renderMandates);
}

async function run() {
    await testTickSpacingAndBindingCache();
    delete global.ImperialMandates;
    delete require.cache[require.resolve('../scripts/mandates/imperialMandateManager.js')];
    console.log('Imperial mandate manager spacing tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
