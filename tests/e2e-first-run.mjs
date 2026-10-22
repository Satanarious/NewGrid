// First-run check: a brand-new profile should receive default.json silently, once.
// Run with: node tests/e2e-first-run.mjs
import puppeteer from 'puppeteer-core';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  userDataDir: mkdtempSync(join(tmpdir(), 'newgrid-first-run-')),
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run'],
});

try {
  const worker = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 20000 });
  const extId = new URL(worker.url()).host;
  const sw = await worker.worker();

  // Give the install handler time to run.
  let state = null;
  for (let i = 0; i < 40 && !state; i++) {
    await pause(250);
    state = await sw.evaluate(async () => {
      const s = await chrome.storage.local.get(null);
      return s['newgrid-defaults-imported'] ? s : null;
    });
  }
  assert.ok(state, 'default.json was not imported on first install');

  const pkg = JSON.parse(readFileSync(join(root, 'default.json'), 'utf8'));
  assert.deepEqual(state['store-site'].sites, pkg.data['store-site'].sites);
  assert.deepEqual(state['store-setting'].setting.layout, pkg.data['store-setting'].setting.layout);

  const page = await browser.newPage();
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extId}/newtab/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#site-items .icon', { timeout: 10000 });
  const shown = await page.$$eval('#site-items .icon', (els) => els.length);
  const expected = pkg.data['store-site'].sites.flat().length;
  assert.ok(shown >= Math.min(expected, 1), `icons shown: ${shown}`);
  assert.deepEqual(dialogs, []);

  const count = await sw.evaluate(async () => (await chrome.storage.local.get('store-site'))['store-site'].sites.flat().length);
  assert.equal(count, expected);
  console.log(`first run ok: ${expected} imported items, no dialogs`);
} finally {
  await browser.close();
}
