import assert from 'assert';
import createImperialMandates from '../scripts/mandates/imperialMandatesCore.js';

function buildAdapterSpy() {
    const calls = [];
    return {
        calls,
        withImperialAudioGuard: (fn) => (typeof fn === 'function' ? fn() : null),
        sanitizeUIBindings: (bindings = {}) => bindings,
        renderImperialModal: () => null,
        showImperialMessage: () => null,
        queueImperialNotification: () => { calls.push({ type: 'notify' }); return true; },
        showMandateBanner: (...args) => { calls.push({ type: 'banner', args }); return true; },
        showRebelDecreeCallout: (...args) => { calls.push({ type: 'rebel', args }); return false; }
    };
}

function buildGameState() {
    const tile = { hex: { toString: () => '0,0' }, type: 'field' };
    return {
        overworld: { hexes: new Map([[tile.hex.toString(), tile]]) },
        gold: 0,
        wood: 0,
        upgrades: {},
        calcOverworldGhosts: () => null
    };
}

async function run() {
    const adapter = buildAdapterSpy();
    const originalRebelSystem = global.RebelSystem;
    const originalTutorialHandler = global.TutorialHandler;
    global.TutorialHandler = {
        spawnFrontierSweepCamp: () => ({
            hex: { toString: () => '1,0' },
            type: 'rebelcamp',
            prevType: 'field'
        })
    };
    createImperialMandates.initImperialMandatesCore?.(global);
    global.RebelSystem = {
        spawnRebelCampNearFrontier: () => ({
            hex: { toString: () => '1,0' },
            type: 'rebelcamp',
            prevType: 'field'
        })
    };

    const mandates = createImperialMandates(adapter, global);
    mandates.resetForNewCampaign();

    const gameState = buildGameState();
    mandates.issuePendingMandates(gameState, {});

    assert.ok(adapter.calls.some((call) => call.type === 'rebel'), 'adapter should handle rebel decree callouts');
    assert.ok(adapter.calls.some((call) => call.type === 'banner'), 'adapter should render banner fallback when callouts decline');

    mandates.recordEvent('tick', { ticks: 1 }, gameState, {});
    assert.strictEqual(mandates.getKingState().currentTick, 1, 'core tick progression should remain available without UI');

    mandates.resetForNewCampaign();
    if (originalRebelSystem) global.RebelSystem = originalRebelSystem;
    else delete global.RebelSystem;
    if (originalTutorialHandler) global.TutorialHandler = originalTutorialHandler;
    else delete global.TutorialHandler;
}

await run();
