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
const settingsGroups = [
  ...settingsSection.matchAll(
    /<fieldset class="settings-group">\s*<legend class="settings-group__label">([^<]+)<\/legend>/g
  ),
];

assert.deepEqual(
  settingsGroups.map(([, groupName]) => groupName),
  ['Audio', 'Visuals', 'General'],
  'Each settings group should be a fieldset named by its visible legend.'
);

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

const drawerShell = html.match(/<div id="hud-drawer"[^>]*>/)?.[0];
const drawerPanel = html.match(/<div class="hud-drawer__panel"[^>]*>/)?.[0];

assert.ok(drawerShell, 'Expected to find the HUD drawer shell.');
assert.doesNotMatch(
  drawerShell,
  /\baria-label(?:ledby)?=/,
  'The generic drawer shell should not own the dialog accessible name.'
);
assert.ok(drawerPanel, 'Expected to find the HUD drawer dialog panel.');
assert.match(drawerPanel, /\brole="dialog"/, 'The drawer panel should expose the dialog role.');
assert.match(
  drawerPanel,
  /\baria-labelledby="hud-drawer-title"/,
  'The drawer dialog should be named by its visible title.'
);
assert.match(
  drawerPanel,
  /\baria-describedby="hud-drawer-subtitle"/,
  'The drawer dialog should be described by its visible subtitle.'
);
