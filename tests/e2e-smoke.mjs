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
    assert.equal(n, 5);
  });

  await step('search engine menu lists built-in engines', async () => {
    await page.click('#engine-btn');
    const n = await page.$$eval('#engine-menu [data-engine]', (els) => els.length);
    assert.equal(n, 8);
    await page.click('body');
  });

  await step('add site through the editor persists to storage', async () => {
    await page.click('#btn-add');
    await page.type('#editor-form [name="name"]', 'Example');
    await page.type('#editor-form [name="target"]', 'example.com');
    await page.click('#editor-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelectorAll('#site-items .icon').length === 6, { timeout: 5000 });
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('store-site'))['store-site']);
    const names = stored.sites.flat().map((i) => i.name);
    assert.ok(names.includes('Example'));
  });

  await step('notes icon opens the notes page and a note can be created', async () => {
    const notesIcon = await page.evaluateHandle(() =>
      [...document.querySelectorAll('#site-items .icon')].find((i) => i.querySelector('.icon-name').textContent === 'Notes'));
    await notesIcon.click();
    await page.waitForSelector('#overlay-plugin:not(.hide) #note-new');
    page.once('dialog', (d) => d.accept('Smoke note'));
    await page.click('#note-new');
    await page.waitForFunction(() => document.querySelector('#note-title')?.value === 'Smoke note', { timeout: 5000 });
    await page.type('#note-body', 'hello');
    await new Promise((r) => setTimeout(r, 700));
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('store-notes'))['store-notes']);
    assert.equal(stored.list[0].title, 'Smoke note');
    assert.equal(stored.list[0].content, 'hello');
    await page.click('#overlay-plugin .close');
  });

  await step('to-do added from the To-dos page is saved', async () => {
    const todoIcon = await page.evaluateHandle(() =>
      [...document.querySelectorAll('#site-items .icon')].find((i) => i.querySelector('.icon-name').textContent === 'To-dos'));
    await todoIcon.click();
    await page.waitForSelector('#overlay-plugin:not(.hide) #todo-input');
    await page.type('#todo-input', 'Buy milk');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.todo-list li[data-id]').length === 1, { timeout: 5000 });
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('store-todo'))['store-todo']);
    assert.equal(stored.todoList[0].text, 'Buy milk');
    await page.click('#overlay-plugin .close');
  });

  await step('dragging one site onto another creates a folder', async () => {
    await page.evaluate(() => {
      const icons = [...document.querySelectorAll('#site-items .icon')];
      const a = icons.find((i) => i.dataset.kind === 'site' && i.querySelector('.icon-name').textContent === 'Notes');
      const b = icons.find((i) => i.dataset.kind === 'site' && i.querySelector('.icon-name').textContent === 'To-dos');
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
    assert.deepEqual(folder.children.map((c) => c.name).sort(), ['Notes', 'To-dos']);
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

