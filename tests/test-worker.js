import { parentPort, workerData } from 'node:worker_threads';
import './test-env.js';

try {
    await import(workerData);
    parentPort.postMessage({ passed: true });
} catch (error) {
    parentPort.postMessage({ error: error.stack ?? String(error) });
}
