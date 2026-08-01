import assert from 'node:assert/strict';
import { runTestWorker } from './worker-runner.js';

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);

const success = await runTestWorker('success.test.js', {
  workerUrl: fixture('worker-success.js'),
  timeoutMs: 1_000,
});
assert.deepEqual(success, { passed: true });

const thrown = await runTestWorker('thrown.test.js', {
  workerUrl: fixture('worker-error.js'),
  timeoutMs: 1_000,
});
assert.match(thrown.error, /thrown\.test\.js: worker error/);
assert.match(thrown.error, /fixture worker failure/);

const exited = await runTestWorker('silent-exit.test.js', {
  workerUrl: fixture('worker-exit.js'),
  timeoutMs: 1_000,
});
assert.match(exited.error, /silent-exit\.test\.js/);
assert.match(exited.error, /exit code 7/);

const timedOut = await runTestWorker('timeout.test.js', {
  workerUrl: fixture('worker-timeout.js'),
  timeoutMs: 25,
});
assert.equal(timedOut.error, 'timeout.test.js: timed out after 25ms');
