// Builds the Firefox (Gecko) package into release/. Run: node scripts/make-firefox.mjs
// The Chrome manifest is adapted for Gecko: event-page background instead of a service
// worker, a Gecko add-on ID, and no Chrome-only manifest keys. Everything else is shared.
import { mkdtempSync, mkdirSync, copyFileSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

const OUT_DIR = join(root, 'release');
const VERSION = manifest.version;

// Fixed add-on ID: must never change between releases or updates will not be found.
const GECKO_ID = '{e5ad6c4e-e78e-4644-80c1-726eadd24e04}';
// Firefox 142: the first release where data_collection_permissions is supported on both
// desktop and Android (AMO validates both; the key needs 142 on Android).
const MIN_GECKO = '142.0';
// The Gecko manifest: same metadata, event-page background, browser-specific settings.
const geckoManifest = { ...manifest };
delete geckoManifest.minimum_chrome_version;
delete geckoManifest.background.service_worker;
geckoManifest.background = { scripts: ['background.js'], type: 'module' };
geckoManifest.permissions = geckoManifest.permissions.filter((p) => p !== 'unlimitedStorage'); // Firefox has no storage quota to lift; AMO lint flags it.
geckoManifest.browser_specific_settings = {
  gecko: {
    id: GECKO_ID,
    strict_min_version: MIN_GECKO,
    // NewGrid collects nothing itself; see PRIVACY.md. AMO requires the declaration.
    data_collection_permissions: { required: ['none'] },
  },
};

// Stage the same files as the Chrome package, with the adapted manifest.
const stage = mkdtempSync(join(tmpdir(), 'newgrid-gecko-'));
const staged = join(stage, 'NewGrid');
mkdirSync(staged);
copyFileSync(join(root, 'manifest.json'), join(staged, 'manifest.json'));
writeFileSync(join(staged, 'manifest.json'), JSON.stringify(geckoManifest, null, 2) + '\n');
copyFileSync(join(root, 'background.js'), join(staged, 'background.js'));
copyFileSync(join(root, 'default.json'), join(staged, 'default.json'));
for (const dir of ['shared', 'newtab', 'popup', 'icons', 'fonts']) {
  cpSync(join(root, dir), join(staged, dir), { recursive: true });
}
// README-only asset, not referenced by the manifest: keep the package minimal.
rmSync(join(staged, 'icons', 'chrome_web_store.png'), { force: true });

mkdirSync(OUT_DIR, { recursive: true });
const zipPath = join(OUT_DIR, `NewGrid-${VERSION}-firefox.zip`);
rmSync(zipPath, { force: true });
// bsdtar (shipped with Windows) writes a forward-slash zip with no top-level folder, like the Chrome package.
execFileSync('tar', ['-a', '-cf', zipPath, '-C', staged, 'manifest.json', 'background.js', 'default.json', 'shared', 'newtab', 'popup', 'icons', 'fonts']);
copyFileSync(zipPath, join(OUT_DIR, `NewGrid-${VERSION}-firefox.xpi`));

console.log(`built release/NewGrid-${VERSION}-firefox.zip and .xpi (gecko id ${GECKO_ID})`);
