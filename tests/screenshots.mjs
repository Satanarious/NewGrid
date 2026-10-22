// Takes screenshots of the new tab page in its main states, for visual review.
// Run: node tests/screenshots.mjs   (writes PNGs into ./screenshots)
import puppeteer from 'puppeteer-core';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'screenshots');
mkdirSync(outDir, { recursive: true });
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  userDataDir: mkdtempSync(join(tmpdir(), 'newgrid-shot-')),
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run'],
});
try {
  const worker = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 20000 });
  const extId = new URL(worker.url()).host;
  const sw = await worker.worker();
  await new Promise((r) => setTimeout(r, 1000));
  await sw.evaluate(async () => { await chrome.storage.local.clear(); await chrome.storage.local.set({ 'newgrid-defaults-imported': true }); });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`chrome-extension://${extId}/newtab/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#site-items .icon');
  await pause(600);
  await page.screenshot({ path: join(outDir, '1-main.png') });

  await page.click('#engine-btn');
  await pause(300);
  await page.screenshot({ path: join(outDir, '2-engine-menu.png') });
  await page.click('body', { offset: { x: 5, y: 5 } });

  await sw.evaluate(async () => {
    const { ['store-setting']: s } = await chrome.storage.local.get('store-setting');
    const setting = { ...(s?.setting || {}) };
    setting.search = { ...(setting.search || {}), scale: 2 };
    setting.layout = { ...(setting.layout || {}), colGap: -40, rowGap: 60 };
    await chrome.storage.local.set({ 'store-setting': { setting, updatetime: Date.now() } });
  });
  await pause(800);
  await page.screenshot({ path: join(outDir, '3-spacing-and-search-2x.png') });

  await page.click('#btn-settings');
  await pause(600);
  await page.evaluate(() => document.querySelector('#sec-wallpaper').scrollIntoView());
  await pause(300);
  await page.screenshot({ path: join(outDir, '4-wallpaper-section.png') });
  await page.evaluate(() => document.querySelector('#sec-backup').scrollIntoView());
  await pause(300);
  await page.screenshot({ path: join(outDir, '5-backup-section.png') });
  await page.click('#drawer .close');
  await pause(400);

  await sw.evaluate(async () => {
    const { ['store-setting']: s } = await chrome.storage.local.get('store-setting');
    const setting = { ...(s?.setting || {}) };
    setting.search = { ...(setting.search || {}), scale: 1 };
    setting.layout = { ...(setting.layout || {}), colGap: 24, rowGap: 16 };
    await chrome.storage.local.set({ 'store-setting': { setting, updatetime: Date.now() } });
  });
  await pause(500);
  await page.click('#btn-add');
  await pause(300);
  const upload = await page.$('#ed-file');
  await upload.uploadFile(join(root, 'icons', 'icon128.png'));
  await pause(500);
  await page.click('#overlay-editor [data-mode="image"]');
  await pause(300);
  await page.screenshot({ path: join(outDir, '6-editor.png') });
} finally {
  await browser.close();
}
console.log('screenshots written to', outDir);
