import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(testsDirectory, '..', 'Wargame.html'), 'utf8');
const settingsSection = html.match(
  /<div class="sidebar-section sidebar-section--settings">([\s\S]*?)<div class="sidebar-section sidebar-section--scrollable">/
)?.[1];

assert.ok(settingsSection, 'Expected to find the sidebar settings section.');

const settingLabels = [
  ...settingsSection.matchAll(/<label class="setting[^>]*>([\s\S]*?)<\/label>/g),
];
const settingsControls = [...settingsSection.matchAll(/<input\b[^>]*>/g)];

assert.equal(
  settingLabels.length,
  settingsControls.length,
  'Every settings control should be wrapped by a label.'
);
assert.ok(settingsControls.length > 0, 'Expected the settings section to contain controls.');

for (const [, labelContent] of settingLabels) {
  assert.match(
    labelContent,
    /<input\b[^>]*\baria-label="[^"]+"[^>]*>/,
    'Every settings control should have an accessible label.'
  );
  assert.doesNotMatch(labelContent, /<div\b/i, 'Settings labels must not contain div elements.');
}
