// Builds the source package for AMO review into release/. Run: node scripts/make-source.mjs
// Contains the xpi contents plus the build scripts and metadata, so a reviewer can
// rebuild release/NewGrid-<version>-firefox.zip with: node scripts/make-firefox.mjs
// The build scripts use only Node builtins; no npm install is needed.
import { mkdtempSync, mkdirSync, copyFileSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

const OUT_DIR = join(root, 'release');
const VERSION = manifest.version;

// Stage the package files in a temp dir, mirroring what make-firefox.mjs stages.
const stage = mkdtempSync(join(tmpdir(), 'newgrid-source-'));
const staged = join(stage, 'NewGrid');
mkdirSync(staged);
for (const file of ['manifest.json', 'background.js', 'default.json', 'package.json', 'package-lock.json', 'LICENSE', 'README.md', 'PRIVACY.md']) {
  copyFileSync(join(root, file), join(staged, file));
}
for (const dir of ['shared', 'newtab', 'popup', 'fonts', 'scripts']) {
  cpSync(join(root, dir), join(staged, dir), { recursive: true });
}
// Icons as shipped; the chrome-store-only README asset is excluded like in the xpi.
cpSync(join(root, 'icons'), join(staged, 'icons'), { recursive: true });
rmSync(join(staged, 'icons', 'chrome_web_store.png'), { force: true });

// A short note for the reviewer at the package root.
writeFileSync(
  join(staged, 'AMO-REVIEW.md'),
  `# NewGrid ${VERSION} — source package\n` +
  '\n' +
  'This is the source for the NewGrid extension. The shipped code is plain,\n' +
  'unminified JavaScript: there is no bundler, minifier or transpiler step.\n\n' +
  'To rebuild the Firefox package (Gecko manifest adaptation included):\n\n' +
  '    node scripts/make-firefox.mjs\n\n' +
  'produces release/NewGrid-' + VERSION + '-firefox.zip / .xpi.\n\n' +
  'Both build scripts use only Node builtins; no npm install is required.\n' +
  'The only difference from the source files is the Gecko manifest generated\n' +
  'by scripts/make-firefox.mjs (add-on ID, event-page background, permission\n' +
  'and data-collection metadata).\n'
);

mkdirSync(OUT_DIR, { recursive: true });
const zipPath = join(OUT_DIR, `NewGrid-${VERSION}-firefox-source.zip`);
rmSync(zipPath, { force: true });
// Same tar trick as make-firefox.mjs: zip with forward slashes, no top-level folder? Keep
// a top-level folder here so the archive unpacks tidily.
execFileSync('tar', ['-a', '-cf', zipPath, '-C', stage, 'NewGrid']);

console.log(`built release/NewGrid-${VERSION}-firefox-source.zip`);
