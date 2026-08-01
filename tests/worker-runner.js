import { Worker } from 'node:worker_threads';

export const DEFAULT_TEST_TIMEOUT_MS = 30_000;

/**
 * Runs one test module in a worker and returns its single terminal result.
 *
 * A worker must send a result before exiting. Errors, early exits, and timeouts
 * are converted to the same result shape so the suite runner cannot hang while
 * waiting for a message that will never arrive.
 *
 * @param {string} filename Test filename used in failure diagnostics.
 * @param {object} [options] Worker construction and timeout overrides.
 * @param {number} [options.timeoutMs] Maximum time allowed for the test.
 * @param {typeof Worker} [options.WorkerClass] Injectable worker implementation.
 * @param {URL} [options.workerUrl] Worker entry point.
 * @param {string} [options.workerData] Module loaded by the worker entry point.
 * @returns {Promise<object>} The worker message or a normalized error result.
 */
export function runTestWorker(
  filename,
  {
    timeoutMs = DEFAULT_TEST_TIMEOUT_MS,
    WorkerClass = Worker,
    workerUrl = new URL('./test-worker.js', import.meta.url),
    workerData = filename,
  } = {}
) {
  const worker = new WorkerClass(workerUrl, { workerData });

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
    };
    const settle = (result, terminate = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (terminate) void worker.terminate();
      resolve(result);
    };
    const onMessage = (result) => settle(result, true);
    const onError = (error) =>
      settle({ error: `${filename}: worker error\n${error.stack ?? String(error)}` });
    const onExit = (code) =>
      settle({ error: `${filename}: worker exited before reporting a result (exit code ${code})` });
    const timer = setTimeout(
      () => settle({ error: `${filename}: timed out after ${timeoutMs}ms` }, true),
      timeoutMs
    );

    worker.once('message', onMessage);
    worker.once('error', onError);
    worker.once('exit', onExit);
  });
}
