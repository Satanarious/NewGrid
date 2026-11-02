// Packs the Chrome build into release/NewGrid-<version>.crx with a private key.
// Run: node scripts/make-crx.mjs
// Signs the staged contents of release/NewGrid-<version>.zip, so the CRX always matches
// the zip that goes to the Chrome Web Store. The CRX ID comes from the key; if the store
// assigned a different ID (zip uploads do), the two installs stay separate. Web Store
// updates still come from the zip upload - the CRX is for manual installation.
// Config: CHROME_PATH (a Chromium that supports --pack-extension), NEWGRID_PEM (signing key).
import { mkdtempSync, existsSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash, createPublicKey } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).version;
const OUT = join(root, 'release');

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const pemPath = process.env.NEWGRID_PEM || 'C:\\Users\\satya\\NewGrid-keys\\newgrid.pem';
const zipPath = join(OUT, `NewGrid-${VERSION}.zip`);

if (!existsSync(chromePath)) {
  console.error(`Chromium not found at ${chromePath} (set CHROME_PATH)`);
  process.exit(1);
}
if (!existsSync(pemPath)) {
  console.error(`Signing key not found at ${pemPath} (set NEWGRID_PEM)`);
  process.exit(1);
}
if (!existsSync(zipPath)) {
  console.error(`Missing ${zipPath} - run node scripts/make-chrome.mjs first`);
  process.exit(1);
}

// Stage the zip contents, pack, and move the result next to it.
const stage = mkdtempSync(join(tmpdir(), 'newgrid-crx-'));
try {
  spawnSync('tar', ['-xf', zipPath, '-C', stage], { stdio: 'inherit' });

  // chrome.exe detaches from its launcher right away; poll for the CRX instead of waiting on the process.
  spawnSync(chromePath, [`--pack-extension=${stage}`, `--pack-extension-key=${pemPath}`, '--no-message-box'], { stdio: 'ignore' });
  const packed = `${stage}.crx`;
  for (let i = 0; i < 70 && !existsSync(packed); i++) await new Promise((r) => setTimeout(r, 200));
  if (!existsSync(packed)) {
    console.error('Chromium did not produce a CRX (it may already be running with incompatible flags)');
    process.exit(1);
  }

  const outPath = join(OUT, `NewGrid-${VERSION}.crx`);
  rmSync(outPath, { force: true });
  copyFileSync(packed, outPath);

  // Sanity checks: CRX3 magic, and the extension ID the key signs (a-p hex of the key hash).
  const crx = readFileSync(outPath);
  const magic = crx.subarray(0, 4).toString();
  const crxVersion = crx.readUInt32LE(4);
  if (magic !== 'Cr24' || crxVersion !== 3) {
    console.error(`Unexpected CRX header: magic ${magic}, version ${crxVersion}`);
    process.exit(1);
  }
  const pub = createPublicKey(readFileSync(pemPath)).export({ type: 'spki', format: 'der' });
  const hash = createHash('sha256').update(pub).digest().subarray(0, 16);
  const id = [...hash].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('');
  console.log(`built release/NewGrid-${VERSION}.crx (CRX3, extension id ${id})`);
} finally {
  rmSync(stage, { recursive: true, force: true });
  rmSync(`${stage}.crx`, { force: true });
  rmSync(`${stage}.pem`, { force: true }); // the packer writes a key copy there only when none is given
}
