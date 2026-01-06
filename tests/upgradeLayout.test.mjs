import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(__dirname, '..', 'style.css');
const css = fs.readFileSync(cssPath, 'utf8');

assert.match(
    css,
    /\.upgrade-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(160px,\s*1fr\)\)/s,
    'Expected upgrade cards to use a narrower min width in the upgrade grid.'
);

assert.match(
    css,
    /\.tech-grid[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(130px,\s*1fr\)\)/s,
    'Expected research cards to use a narrower min width in the tech grid.'
);

assert.match(
    css,
    /\.command-card\s*\{[^}]*padding:\s*6px\s+8px;/s,
    'Expected command cards to use tighter padding for a slimmer layout.'
);
