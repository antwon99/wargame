import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const rootHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const gameHtml = fs.readFileSync(path.join(dist, 'Wargame.html'), 'utf8');

assert.match(rootHtml, /Wargame\.html/, 'root page should direct visitors to the game page');
assert.match(gameHtml, /href="style\.css"/, 'game page should load its stylesheet');

const bundleMatch = gameHtml.match(/src="\.\/assets\/(game-[^"]+\.js)"/);
assert.ok(bundleMatch, 'game page should reference its generated bundle');

const requiredFiles = [
    'style.css',
    path.join('assets', bundleMatch[1]),
    path.join('sfx', 'system', 'victory.mp3'),
    path.join('sfx', 'combat', 'sword', 'sword.mp3'),
    path.join('sfx', 'ambient', 'ambient.mp3')
];

for (const relativePath of requiredFiles) {
    const filePath = path.join(dist, relativePath);
    assert.ok(fs.statSync(filePath).size > 0, `${relativePath} should be a non-empty built asset`);
}

console.log('Built-site smoke check passed.');
