import { spawnSync } from 'node:child_process';

const defaultDocuments = ['Wargame.html', 'index.html'];
const documents = process.argv.slice(2);
const validationTargets = documents.length > 0 ? documents : defaultDocuments;
const result = spawnSync('html5validator', ['--root', ...validationTargets], { stdio: 'inherit' });

if (result.error) {
  console.error(
    'Unable to run html5validator. Install it with "python -m pip install html5validator==0.4.2".'
  );
  console.error(result.error.message);
  process.exitCode = 127;
} else {
  process.exitCode = result.status ?? 1;
}
