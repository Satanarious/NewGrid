// Builds the Chrome (Chromium MV3) package into release/. Run: node scripts/make-chrome.mjs
// The Chrome package is the source manifest as-is: service-worker background and the
// Chrome-only keys stay. The zip is what gets uploaded to the Chrome Web Store; a .crx
// needs the private key, so Web Store upload from the zip is the usual path.
import { mkdtempSync, mkdirSync, copyFileSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).version;

const OUT_DIR = join(root, 'release');

// Stage the same files as the Firefox package, but with the source manifest untouched.
const stage = mkdtempSync(join(tmpdir(), 'newgrid-chrome-'));
const staged = join(stage, 'NewGrid');
mkdirSync(staged);
for (const file of ['manifest.json', 'background.js', 'default.json']) {
  copyFileSync(join(root, file), join(staged, file));
}
for (const dir of ['shared', 'newtab', 'popup', 'icons', 'fonts']) {
  cpSync(join(root, dir), join(staged, dir), { recursive: true });
}
// README-only asset, not referenced by the manifest: keep the package minimal.
rmSync(join(staged, 'icons', 'chrome_web_store.png'), { force: true });

mkdirSync(OUT_DIR, { recursive: true });
const zipPath = join(OUT_DIR, `NewGrid-${VERSION}.zip`);
rmSync(zipPath, { force: true });
// Same tar trick the other scripts use: zip with forward slashes, no top-level folder.
execFileSync('tar', ['-a', '-cf', zipPath, '-C', staged, 'manifest.json', 'background.js', 'default.json', 'shared', 'newtab', 'popup', 'icons', 'fonts']);

console.log(`built release/NewGrid-${VERSION}.zip`);
