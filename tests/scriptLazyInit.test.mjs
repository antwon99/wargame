import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const scriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'script.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');

function transformToCommonJs(source) {
    return source
        .replace(
            /import\s+\{\s*bootstrapGame\s*\}\s*from\s*['"]\.\/game\/bootstrap.js['"];?/,
            'const { bootstrapGame } = require("./game/bootstrap.js");'
        )
        .replace(
            /export\s+\{\s*createGameCore\s*\}\s+from\s+['"]\.\/game\/core.js['"];?/,
            'const { createGameCore } = require("./game/core.js"); exports.createGameCore = createGameCore;'
        )
        .replace(/export\s+\{\s*bootstrapGame\s*\};?/, 'exports.bootstrapGame = bootstrapGame;');
}

function loadModuleWithStubs() {
    const transformed = transformToCommonJs(scriptSource);
    const calls = { bootstrap: 0 };

    const moduleExports = {};
    const context = vm.createContext({
        exports: moduleExports,
        require: (specifier) => {
            if (specifier === './game/bootstrap.js') {
                return { bootstrapGame: () => { calls.bootstrap += 1; } };
            }

            if (specifier === './game/core.js') {
                return { createGameCore: () => ({}) };
            }

            throw new Error(`Unexpected require: ${specifier}`);
        },
        console
    });

    const script = new vm.Script(transformed, { filename: 'script.js' });
    script.runInContext(context);

    return { exports: moduleExports, calls };
}

async function testImportDoesNotBootstrap() {
    const { exports, calls } = loadModuleWithStubs();

    assert.strictEqual(calls.bootstrap, 0, 'Importing the script should not bootstrap the game.');
    exports.bootstrapGame();
    assert.strictEqual(calls.bootstrap, 1, 'Calling bootstrapGame should trigger the bootstrap stub once.');
}

async function run() {
    await testImportDoesNotBootstrap();
    console.log('Script lazy bootstrap test passed.');
}

await run();
