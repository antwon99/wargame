import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const assetDir = path.join(distDir, 'assets');
const htmlPath = path.resolve('Wargame.html');
const distHtmlPath = path.join(distDir, 'Wargame.html');

function findBundle() {
    const files = fs.existsSync(assetDir) ? fs.readdirSync(assetDir) : [];
    const bundle = files.find((file) => /^game-.*\.js$/.test(file));
    if (!bundle) {
        throw new Error('No bundle found in dist/assets. Did Rollup run?');
    }
    return `./assets/${bundle}`;
}

function injectBundleTag(sourceHtml, bundlePath) {
    const cleaned = sourceHtml.replace(/<script[^>]*src="scripts\/[^"]+"[^>]*><\/script>\s*/g, '')
        .replace(/<script type="module">[\s\S]*?<\/script>/g, '');
    const insertion = `<script defer src="${bundlePath}"></script>`;
    return cleaned.replace('</body>', `    ${insertion}\n</body>`);
}

function copyStatic() {
    fs.copyFileSync(path.resolve('index.html'), path.join(distDir, 'index.html'));
    fs.copyFileSync(path.resolve('style.css'), path.join(distDir, 'style.css'));
    fs.cpSync(path.resolve('sfx'), path.join(distDir, 'sfx'), { recursive: true });
}

function main() {
    const bundlePath = findBundle();
    const html = fs.readFileSync(htmlPath, 'utf8');
    const injected = injectBundleTag(html, bundlePath);
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(distHtmlPath, injected, 'utf8');
    copyStatic();
    console.log(`Injected ${bundlePath} into dist/Wargame.html`);
}

main();
