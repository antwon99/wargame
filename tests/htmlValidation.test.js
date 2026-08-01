import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.execPath,
  ['scripts/validate-html.js', 'tests/fixtures/invalid-label-aria.html'],
  { cwd: repositoryRoot, encoding: 'utf8' }
);

assert.notEqual(
  result.status,
  127,
  `The HTML validator must be installed before running tests.\n${result.stderr}`
);
assert.equal(
  result.status,
  1,
  `Invalid label content and ARIA use must fail validation.\n${result.stdout}\n${result.stderr}`
);
