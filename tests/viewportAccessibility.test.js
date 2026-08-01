import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(testsDirectory, '..', 'Wargame.html'), 'utf8');
const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"\s*>/i)?.[1];

assert.ok(viewport, 'Expected the document to define a viewport meta tag.');
assert.match(
  viewport,
  /(?:^|,\s*)width=device-width(?:,|$)/,
  'The viewport should track the device width.'
);
assert.match(
  viewport,
  /(?:^|,\s*)initial-scale=1\.0(?:,|$)/,
  'The viewport should use the default initial scale.'
);
assert.doesNotMatch(
  viewport,
  /(?:^|,\s*)maximum-scale\s*=/i,
  'The viewport must not cap browser zoom.'
);
assert.doesNotMatch(
  viewport,
  /(?:^|,\s*)user-scalable\s*=\s*no/i,
  'The viewport must not disable user zoom.'
);
