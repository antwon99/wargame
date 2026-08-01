import assert from 'assert';

async function run() {
    const { createGameCore } = await import('../scripts/game/core.js');

    const errorLog = [];
    const originalConsoleError = console.error;
    console.error = (...args) => {
        errorLog.push(args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' '));
    };

    try {
        delete global.document;
        const { Game } = createGameCore();

        assert.doesNotThrow(
            () => Game.reportRecoverableError('headless run', new Error('boom')),
            'reportRecoverableError should not throw when document is unavailable'
        );

        assert.ok(
            errorLog.some((entry) => entry.includes('headless run')),
            'console logging should remain available without DOM bindings'
        );
    } finally {
        console.error = originalConsoleError;
    }
}

await run();
