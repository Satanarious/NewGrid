// End-to-end smoke test: loads the unpacked extension in a real Chrome and exercises the new tab page.
// Run with: node tests/e2e-smoke.mjs   (set CHROME_PATH to a Chromium build that still supports --load-extension)
// Chrome 137+ branded builds removed --load-extension, so Edge or Chrome for Testing is needed.
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  userDataDir: mkdtempSync(join(tmpdir(), 'newgrid-e2e-')),
  args: [
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

let failures = 0;
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
};

try {
  const worker = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 20000 });
  const extId = new URL(worker.url()).host;
  const sw = await worker.worker();
  await new Promise((r) => setTimeout(r, 1000));
  await sw.evaluate(async () => { await chrome.storage.local.clear(); await chrome.storage.local.set({ 'newgrid-defaults-imported': true }); });

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extId}/newtab/index.html`, { waitUntil: 'domcontentloaded' });

  await step('new tab renders default icons', async () => {
    await page.waitForSelector('#site-items .icon', { timeout: 10000 });
    const n = await page.$$eval('#site-items .icon', (els) => els.length);
    assert.equal(n, 3);
  });

  await step('search: engine menu lists all 13 built-ins', async () => {
    await page.click('#engine-btn');
    const n = await page.$$eval('#engine-menu [data-engine]', (els) => els.length);
    assert.equal(n, 13);
    await page.click('body');
  });

  await step('search: default label, menu persists, Enter uses chrome.search only for the default engine', async () => {
    // A separate page so the results navigation cannot disturb the later steps.
    await sw.evaluate(async () => {
      const { ['store-setting']: s = {} } = await chrome.storage.local.get('store-setting');
      s.setting = s.setting || {};
      s.setting.link = { ...(s.setting.link || {}), search: false }; // CURRENT_TAB keeps the assertion on this page
      await chrome.storage.local.set({ 'store-setting': s });
    });
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1280, height: 800 });
    await page2.goto(`chrome-extension://${extId}/newtab/index.html`, { waitUntil: 'domcontentloaded' });
    await page2.waitForSelector('#site-items .icon', { timeout: 10000 });
    try {
      // The label shows the selected engine (built-in default: Google) with its category tabs.
      assert.equal(await page2.$eval('#engine-btn', (el) => el.textContent.trim()), 'Google ▾');
      assert.equal((await page2.$$('#type-tabs button')).length, 5, 'category tabs for Google');

      // Picking an engine in the menu persists it as the current engine.
      await page2.click('#engine-btn');
      await page2.click('#engine-menu [data-engine="brave"]');
      await page2.waitForFunction(() => document.getElementById('engine-btn').textContent.trim() === 'Brave ▾', { timeout: 5000 });
      const stored = await sw.evaluate(async () => (await chrome.storage.local.get('store-search'))['store-search']);
      assert.equal(stored.searchEngine.current, 'brave', 'menu selection persisted');

      // A non-default engine searches directly through its own URL.
      let nav = page2.waitForNavigation({ timeout: 20000 });
      await page2.focus('#search-input');
      await page2.type('#search-input', 'opencode test');
      await page2.keyboard.press('Enter');
      await nav;
      assert.ok(page2.url().startsWith('https://search.brave.com/search'), `expected Brave directly, got ${page2.url()}`);

      // Back on the built-in default engine, Enter goes through chrome.search, so the
      // results follow the browser's default provider (Bing on a fresh Edge profile).
      await page2.goto(`chrome-extension://${extId}/newtab/index.html`, { waitUntil: 'domcontentloaded' });
      await page2.waitForSelector('#site-items .icon', { timeout: 10000 });
      await page2.click('#engine-btn');
      await page2.click('#engine-menu [data-engine="google"]');
      await page2.waitForFunction(() => document.getElementById('engine-btn').textContent.trim() === 'Google ▾', { timeout: 5000 });
      nav = page2.waitForNavigation({ timeout: 20000 });
      await page2.focus('#search-input');
      await page2.type('#search-input', 'opencode test');
      await page2.keyboard.press('Enter');
      await nav;
      assert.ok(/bing\.com|google\.com/.test(page2.url()), `default engine should search via chrome.search, got ${page2.url()}`);
      assert.ok(page2.url().includes('opencode'), 'query carried to the provider');
    } finally {
      await page2.close();
      await sw.evaluate(async () => {
        const { ['store-setting']: s } = await chrome.storage.local.get('store-setting');
        s.setting.link.search = true;
        await chrome.storage.local.set({ 'store-setting': s });
      });
    }
  });

  await step('add site through the editor persists to storage', async () => {
    await page.click('#btn-add');
    await page.type('#editor-form [name="name"]', 'Example');
    await page.type('#editor-form [name="target"]', 'example.com');
    await page.click('#editor-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelectorAll('#site-items .icon').length === 4, { timeout: 5000 });
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('store-site'))['store-site']);
    const names = stored.sites.flat().map((i) => i.name);
    assert.ok(names.includes('Example'));
  });

  await step('dragging one site onto another creates a folder', async () => {
    await page.evaluate(() => {
      const icons = [...document.querySelectorAll('#site-items .icon')];
      const a = icons.find((i) => i.dataset.kind === 'site' && i.querySelector('.icon-name').textContent === 'Google');
      const b = icons.find((i) => i.dataset.kind === 'site' && i.querySelector('.icon-name').textContent === 'Wallpaper');
      const dt = new DataTransfer();
      const r = b.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      a.dispatchEvent(new DragEvent('dragstart', { ...opts, clientX: 0, clientY: 0 }));
      b.dispatchEvent(new DragEvent('dragover', opts));
      b.dispatchEvent(new DragEvent('drop', opts));
    });
    await page.waitForFunction(() => document.querySelectorAll('#site-items .icon.folder').length === 1, { timeout: 5000 });
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('store-site'))['store-site']);
    const folder = stored.sites.flat().find((i) => i.children);
    assert.ok(folder, 'folder saved');
    assert.deepEqual(folder.children.map((c) => c.name).sort(), ['Google', 'Wallpaper']);
  });

  await step('clicking a folder opens it and shows its children', async () => {
    await page.click('#site-items .icon.folder');
    await page.waitForSelector('#overlay-folder:not(.hide) .folder-items .icon');
    const n = await page.$$eval('#overlay-folder .folder-items .icon', (els) => els.length);
    assert.equal(n, 2);
    await page.click('#overlay-folder .close');
  });

  await step('settings panel toggles a view option and stores it', async () => {
    await page.click('#btn-settings');
    await page.waitForFunction(() => document.getElementById('drawer').classList.contains('open'));
    await new Promise((r) => setTimeout(r, 450));
    await page.waitForSelector('#set-view-pagin');
    await page.click('#set-view-pagin');
    await page.waitForFunction(() => document.body.classList.contains('show-pager'), { timeout: 5000 });
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('store-setting'))['store-setting']);
    assert.equal(stored.setting.view.pagin, true);
    await page.click('#drawer .close');
    await new Promise((r) => setTimeout(r, 450));
  });

  await step('changing the column count persists and repacks the layout', async () => {
    await page.click('#btn-settings');
    await page.waitForFunction(() => document.getElementById('drawer').classList.contains('open'));
    await new Promise((r) => setTimeout(r, 450));
    await page.waitForSelector('#set-layout-custom');
    await page.click('#set-layout-custom');
    await page.waitForSelector('#set-layout-col');
    await page.$eval('#set-layout-col', (el) => {
      el.value = '4';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('site-items')).getPropertyValue('--icon-col').trim() === '4', { timeout: 5000 });
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('store-setting'))['store-setting']);
    assert.equal(stored.setting.layout.col, 4);
    await page.click('#drawer .close');
  });

  await step('no uncaught page errors', async () => {
    // Missing website icons are expected (they fall back to a letter); ignore those console lines.
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), []);
  });
} finally {
  await browser.close();
}

if (failures) {
  console.log(`${failures} step(s) failed`);
  process.exit(1);
}
console.log('e2e smoke passed');

