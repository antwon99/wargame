const fs = require('fs');
const path = require('path');
const Module = require('module');
const { transformFileSync, transformSync } = require('@babel/core');
const vm = require('vm');
const { pathToFileURL } = require('url');

const stubElement = () => ({
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    appendChild: () => {},
    setAttribute: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    remove: () => {},
    style: { setProperty: () => {} },
    dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    innerText: '',
    textContent: ''
});

if (!global.document) {
    global.document = {
        createElement: stubElement,
        getElementById: () => stubElement(),
        querySelector: () => stubElement(),
        querySelectorAll: () => [],
        addEventListener: () => {},
        body: stubElement()
    };
}

if (!global.window) {
    global.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {}, document: global.document };
}

require('@babel/register')({
    extensions: ['.js'],
    presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]],
    babelrc: false,
    configFile: false,
    ignore: [/node_modules/],
    sourceType: 'unambiguous'
});

const testsDir = __dirname;

function runMjs(file) {
    const abs = path.join(testsDir, file);
    const fileUrl = pathToFileURL(abs).href;
    const raw = fs.readFileSync(abs, 'utf8').replace(/import\.meta\.url/g, `'${fileUrl}'`);
    const { code } = transformSync(raw, {
        presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]],
        sourceType: 'module',
        filename: abs
    });
    const mod = new Module(abs, module.parent);
    mod.filename = abs;
    mod.paths = Module._nodeModulePaths(path.dirname(abs));
    const context = vm.createContext({
        require: mod.require.bind(mod),
        module: mod,
        exports: mod.exports,
        __filename: abs,
        __dirname: path.dirname(abs),
        console,
        process,
        global,
        URL
    });
    const script = new vm.Script(code, { filename: abs });
    script.runInContext(context);
}

function main() {
    const files = fs.readdirSync(testsDir)
        .filter((file) => file.endsWith('.test.js') || file.endsWith('.test.mjs'))
        .sort();

    files.forEach((file) => {
        if (!global.document || typeof global.document !== 'object') {
            global.document = {};
        }
        global.document.createElement = stubElement;
        if (!global.document.getElementById) global.document.getElementById = () => stubElement();
        if (!global.document.querySelector) global.document.querySelector = () => stubElement();
        if (!global.document.querySelectorAll) global.document.querySelectorAll = () => [];
        if (!global.document.addEventListener) global.document.addEventListener = () => {};
        if (!global.document.body) global.document.body = stubElement();
        if (!global.window) global.window = {};
        if (!global.window.dispatchEvent) global.window.dispatchEvent = () => {};
        if (!global.window.addEventListener) global.window.addEventListener = () => {};
        if (!global.window.removeEventListener) global.window.removeEventListener = () => {};
        if (!global.window.document) global.window.document = global.document;
        if (file.endsWith('.test.mjs')) {
            runMjs(file);
        } else {
            require(path.join(testsDir, file));
        }
    });
}

main();
