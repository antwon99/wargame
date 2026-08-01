import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TEST_TIMEOUT_MS, runTestWorker } from './worker-runner.js';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const files = fs
  .readdirSync(testsDir)
  .filter((file) => file.endsWith('.test.js') || file.endsWith('.test.mjs'))
  .sort();

const failures = [];
const timeoutMs = Number(process.env.TEST_TIMEOUT_MS ?? DEFAULT_TEST_TIMEOUT_MS);

if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
  throw new Error('TEST_TIMEOUT_MS must be a positive integer');
}

for (const file of files) {
  const result = await runTestWorker(file, {
    timeoutMs,
    workerData: path.join(testsDir, file),
  });
  if (result.error) {
    failures.push(file);
    console.error(`${file}:\n${result.error}`);
  }
}

if (failures.length > 0) {
  throw new Error(`${failures.length} test file(s) failed: ${failures.join(', ')}`);
}

console.log(`All ${files.length} test files passed.`);
