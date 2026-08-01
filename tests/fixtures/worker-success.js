import { parentPort } from 'node:worker_threads';

parentPort.postMessage({ passed: true });
