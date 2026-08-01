import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const files = fs
    .readdirSync(testsDir)
    .filter((file) => file.endsWith('.test.js') || file.endsWith('.test.mjs'))
    .sort();

const failures = [];

for (const file of files) {
    const worker = new Worker(new URL('./test-worker.js', import.meta.url), {
        workerData: path.join(testsDir, file)
    });
    const result = await new Promise((resolve) => {
        worker.once('message', resolve);
        worker.once('error', (error) => resolve({ error: error.stack ?? String(error) }));
    });
    await worker.terminate();
    if (result.error) {
        failures.push(file);
        console.error(`${file}:\n${result.error}`);
    }
}

if (failures.length > 0) {
    throw new Error(`${failures.length} test file(s) failed: ${failures.join(', ')}`);
}

console.log(`All ${files.length} test files passed.`);
