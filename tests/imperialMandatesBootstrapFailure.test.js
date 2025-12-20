const assert = require('assert');

async function run() {
    const previousWindow = global.window;
    const previousDocument = global.document;

    global.document = { getElementById: () => null };
    global.window = {
        addEventListener: () => {},
        removeEventListener: () => {}
    };

    const { createGameCore } = await import('../scripts/game/core.js');
    const { Game } = createGameCore({ loadImperialMandates: () => Promise.resolve(null) });

    await assert.rejects(
        () => Game.ensureFrontierSweepSeeded(),
        (error) => {
            assert.match(
                error.message,
                /imperial mandates unavailable/i,
                'bootstrap should explicitly fail when imperial mandates bundle is missing'
            );
            return true;
        }
    );

    if (previousWindow) {
        global.window = previousWindow;
    } else {
        delete global.window;
    }

    if (previousDocument) {
        global.document = previousDocument;
    } else {
        delete global.document;
    }
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
