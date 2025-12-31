import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

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

const testsDir = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    const files = fs.readdirSync(testsDir)
        .filter((file) => file.endsWith('.test.js') || file.endsWith('.test.mjs'))
        .sort();

    for (const file of files) {
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

        const abs = path.join(testsDir, file);
        await import(pathToFileURL(abs).href);
    }
}

await main();
