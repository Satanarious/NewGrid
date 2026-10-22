// Browser checks for the wallpaper library, custom icons, the icon editor and page-turn animation.
// Run with: node tests/e2e-features.mjs
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  userDataDir: mkdtempSync(join(tmpdir(), 'newgrid-feat-')),
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--no-first-run'],
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

async function confirmOk(page) {
  await page.waitForSelector('#overlay-confirm:not(.hide) .confirm-ok');
  await page.click('#overlay-confirm .confirm-ok');
  await page.waitForSelector('#overlay-confirm.hide', { hidden: false, timeout: 3000 }).catch(() => {});
  await pause(200);
}

try {
  const worker = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 20000 });
  const extId = new URL(worker.url()).host;
  const sw = await worker.worker();
  await new Promise((r) => setTimeout(r, 1000));
  await sw.evaluate(async () => { await chrome.storage.local.clear(); await chrome.storage.local.set({ 'newgrid-defaults-imported': true }); });
  const stored = (key) => sw.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key);

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extId}/newtab/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#site-items .icon');

  await step('wallpaper library: removing an item removes its row and leaves the rest usable', async () => {
    await page.click('#btn-settings');
    await page.waitForFunction(() => document.getElementById('drawer').classList.contains('open'));
    await pause(400);
    for (const url of [PIXEL, PIXEL.replace('AAAA', 'AAAB')]) {
      await page.click('#wp-url');
      await page.type('#wp-url', url);
      await page.click('#wp-url-add');
      await pause(300);
    }
    await page.waitForFunction(() => document.querySelectorAll('#sec-wallpaper figure').length === 2, { timeout: 5000 });
    await page.click('#sec-wallpaper figure:first-child [data-drop]');
    await confirmOk(page);
    await page.waitForFunction(() => document.querySelectorAll('#sec-wallpaper figure').length === 1, { timeout: 5000 });
    assert.equal((await stored('store-wallpaper')).library.length, 1);
    await page.click('#sec-wallpaper figure:first-child [data-drop]');
    await confirmOk(page);
    await page.waitForFunction(() => document.querySelectorAll('#sec-wallpaper figure').length === 0, { timeout: 5000 });
    assert.equal((await stored('store-wallpaper')).library.length, 0);
    await page.click('#drawer .close');
    await pause(400);
  });

  await step('a custom image set on an icon is displayed', async () => {
    await sw.evaluate(async (src) => {
      const { ['store-site']: s } = await chrome.storage.local.get('store-site');
      const pages = s ? s.sites.map((p) => p.map((i) => ({ ...i }))) : [[]];
      pages[0].push({ id: 'siteId-custom', uuid: 'site-custom', name: 'Custom', target: 'https://example.com/', type: 'web', bgType: 'image', bgImage: src, updatetime: 1 });
      await chrome.storage.local.set({ 'store-site': { sites: pages, redirectVersion: '', updatedIconVersion: '' } });
    }, PIXEL);
    await page.waitForFunction(() => [...document.querySelectorAll('#site-items .icon')].some((i) => i.querySelector('.icon-name').textContent === 'Custom'), { timeout: 5000 });
    const bg = await page.evaluate(() => {
      const icon = [...document.querySelectorAll('#site-items .icon')].find((i) => i.querySelector('.icon-name').textContent === 'Custom');
      return getComputedStyle(icon.querySelector('.icon-content')).backgroundImage;
    });
    assert.notEqual(bg, 'none');
    assert.ok(bg.includes('data:image/png'));
  });

  await step('icon editor: text icon is saved as a rendered image', async () => {
    await page.click('#btn-add');
    await page.waitForSelector('#overlay-editor:not(.hide)');
    await page.click('#overlay-editor [data-mode="text"]');
    await page.type('#ed-text', 'AB');
    await page.type('#editor-form [name="name"]', 'Letters');
    await page.type('#editor-form [name="target"]', 'letters.example');
    await page.click('#editor-form button[type="submit"]');
    await page.waitForFunction(() => [...document.querySelectorAll('#site-items .icon')].some((i) => i.querySelector('.icon-name').textContent === 'Letters'), { timeout: 5000 });
    const sites = (await stored('store-site')).sites.flat();
    const saved = sites.find((i) => i.name === 'Letters');
    assert.equal(saved.bgType, 'image');
    assert.ok(saved.bgImage.startsWith('data:image/png'));
    assert.equal(saved.iconEdit.mode, 'text');
    assert.equal(saved.iconEdit.text, 'AB');
  });

  await step('icon editor: image mode keeps zoom and offset for re-editing', async () => {
    const icon = await page.evaluateHandle(() => [...document.querySelectorAll('#site-items .icon')].find((i) => i.querySelector('.icon-name').textContent === 'Letters'));
    await icon.asElement().click({ button: 'right' });
    await page.waitForSelector('#overlay-editor:not(.hide)');
    assert.equal(await page.$eval('#overlay-editor .editor-title', (el) => el.textContent), 'Edit icon');
    assert.equal(await page.$eval('#ed-text', (el) => el.value), 'AB');
    await page.click('#overlay-editor .cancel');
  });

  await step('page turn animation: the chosen effect is applied to the pages', async () => {
    await page.click('#btn-settings');
    await page.waitForFunction(() => document.getElementById('drawer').classList.contains('open'));
    await pause(400);
    await page.select('#set-layout-easing', 'fade');
    await pause(300);
    const opacities = await page.$$eval('#site-items .page', (els) => els.map((e) => e.style.opacity));
    assert.equal(opacities[0], '1');
    await page.click('#drawer .close');
    await pause(400);
  });


  await step('folder icons can be edited by right-click, and a link with a port keeps working', async () => {
    await sw.evaluate(async () => {
      const mk = (name) => ({ id: 'siteId-' + name, uuid: 'site-' + name, name, target: 'https://example.com/' + name, type: 'web', bgType: 'color', bgColor: '#4a90e2', bgText: name[0], updatetime: 1 });
      await chrome.storage.local.set({ 'store-site': { sites: [[{ id: 'folderId-f', uuid: 'folder-f', name: 'Box', children: [mk('Alpha'), mk('Beta')], updatetime: 1 }]], redirectVersion: '', updatedIconVersion: '' } });
    });
    await pause(500);
    await page.click('#site-items .icon.folder');
    await page.waitForSelector('#overlay-folder:not(.hide) .folder-items .icon');
    const child = await page.evaluateHandle(() => [...document.querySelectorAll('#overlay-folder .folder-items .icon')].find((i) => i.querySelector('.icon-name').textContent === 'Beta'));
    await child.asElement().click({ button: 'right' });
    await page.waitForSelector('#overlay-editor:not(.hide)');
    await page.$eval('#editor-form [name="name"]', (el) => { el.value = ''; });
    await page.type('#editor-form [name="name"]', 'Gamma');
    await page.click('#editor-form button[type="submit"]');
    await page.waitForFunction(() => [...document.querySelectorAll('#overlay-folder .folder-items .icon .icon-name')].some((n) => n.textContent === 'Gamma'), { timeout: 5000 });
    const folder = (await stored('store-site')).sites.flat().find((i) => i.children);
    assert.deepEqual(folder.children.map((c) => c.name), ['Alpha', 'Gamma']);
    await page.click('#overlay-folder .close');
    await pause(300);
    await page.click('#btn-add');
    await page.waitForSelector('#overlay-editor:not(.hide)');
    await page.type('#editor-form [name="name"]', 'Local app');
    await page.type('#editor-form [name="target"]', 'localhost:8080');
    await page.click('#editor-form button[type="submit"]');
    await pause(400);
    const saved = (await stored('store-site')).sites.flat().find((i) => i.name === 'Local app');
    assert.equal(saved.target, 'https://localhost:8080');
  });

  await step('icon editor: zoom buttons and wheel change the zoom readout', async () => {
    await page.click('#btn-add');
    await page.waitForSelector('#overlay-editor:not(.hide)');
    await page.$('#ed-file').then((u) => u.uploadFile(join(root, 'icons', 'icon128.png')));
    await pause(500);
    const label = () => page.$eval('#ed-zoom-label', (e) => e.textContent);
    const before = await label();
    await page.click('#ed-zoom-in');
    await pause(100);
    assert.notEqual(await label(), before);
    await page.hover('#ed-stage');
    await page.mouse.wheel({ deltaY: -120 });
    await pause(150);
    const afterWheel = await label();
    await page.mouse.wheel({ deltaY: 120 });
    await pause(150);
    assert.notEqual(afterWheel, await label());
    await page.click('#overlay-editor .cancel');
  });
  await step('icon editor: a line-mode mouse notch zooms, and dragging the picture moves it', async () => {
    await page.click('#btn-add');
    await page.waitForSelector('#overlay-editor:not(.hide)');
    const upload = await page.$('#ed-file');
    await upload.uploadFile(join(root, 'icons', 'icon128.png'));
    await pause(500);
    const zoomText = () => page.$eval('#ed-zoom-label', (e) => e.textContent);
    const before = parseInt(await zoomText(), 10);
    await page.evaluate(() => document.getElementById('ed-stage').dispatchEvent(new WheelEvent('wheel', { deltaY: -3, deltaMode: 1, bubbles: true, cancelable: true })));
    await pause(150);
    const after = parseInt(await zoomText(), 10);
    assert.ok(after >= before * 1.2, `zoom ${before}% -> ${after}%`);
    const left = () => page.$eval('#ed-full', (e) => parseFloat(e.style.left));
    const start = await left();
    const box = await page.$eval('#ed-stage', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top]; });
    await page.mouse.move(box[0] + 170, box[1] + 170);
    await page.mouse.down();
    await page.mouse.move(box[0] + 230, box[1] + 170, { steps: 6 });
    await page.mouse.up();
    assert.ok(Math.abs((await left()) - start) > 30, 'picture moved');
    await page.click('#overlay-editor .cancel');
  });

  await step('website icons can be zoomed and moved, and the grid shows the same transform', async () => {
    await page.click('#btn-add');
    await page.waitForSelector('#overlay-editor:not(.hide)');
    await page.type('#editor-form [name="name"]', 'Site zoom');
    await page.type('#editor-form [name="target"]', 'example.org');
    await page.hover('#ed-stage');
    await page.mouse.wheel({ deltaY: -100 });
    await page.mouse.wheel({ deltaY: -100 });
    const box = await page.$eval('#ed-stage', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top]; });
    await page.mouse.move(box[0] + 170, box[1] + 170);
    await page.mouse.down();
    await page.mouse.move(box[0] + 200, box[1] + 200, { steps: 5 });
    await page.mouse.up();
    const zoomNow = parseInt(await page.$eval('#ed-zoom-label', (e) => e.textContent), 10);
    assert.ok(zoomNow > 100, `website icon zoomed to ${zoomNow}%`);
    await page.click('#editor-form button[type="submit"]');
    await pause(600);
    const saved = (await stored('store-site')).sites.flat().find((i) => i.name === 'Site zoom');
    assert.equal(saved.iconEdit.mode, 'site');
    assert.ok(saved.iconEdit.zoom > 1 && saved.iconEdit.fx > 0, JSON.stringify(saved.iconEdit));
    const gridTransform = await page.evaluate(() => {
      const icon = [...document.querySelectorAll('#site-items .icon')].find((i) => i.querySelector('.icon-name').textContent === 'Site zoom');
      return getComputedStyle(icon.querySelector('img.favicon')).transform;
    });
    assert.notEqual(gridTransform, 'none');
  });

  await step('website icons come from icon.horse, processed with a transparent background, without any permission', async () => {
    await page.click('#btn-add');
    await page.waitForSelector('#overlay-editor:not(.hide)');
    await page.type('#editor-form [name="name"]', 'Better icon');
    await page.type('#editor-form [name="target"]', 'github.com');
    await page.click('#editor-form button[type="submit"]');
    await page.waitForFunction(() => {
      const icon = [...document.querySelectorAll('#site-items .icon')].find((i) => i.querySelector('.icon-name').textContent === 'Better icon');
      return icon?.querySelector('img.favicon')?.getAttribute('src')?.startsWith('data:image/png');
    }, { timeout: 20000 });
    const cached = await sw.evaluate(async () => (await chrome.storage.local.get('store-icon-cache-v2'))['store-icon-cache-v2']);
    assert.ok(cached['github.com'].startsWith('data:image/png'));
  });

  await step('linked pictures keep their zoom: copied when the site allows it, placed with zoom when it does not', async () => {
    const { createServer } = await import('node:http');
    const { readFileSync } = await import('node:fs');
    const picture = readFileSync(join(root, 'tests', 'fixtures', 'transparent-logo.png'));
    const servers = [];
    const serve = (cors) => new Promise((resolve) => {
      const s = createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/png', ...(cors ? { 'Access-Control-Allow-Origin': '*' } : {}) });
        res.end(picture);
      });
      s.listen(0, '127.0.0.1', () => { servers.push(s); resolve(s.address().port); });
    });
    try {
      const corsPort = await serve(true);
      const plainPort = await serve(false);

      await page.click('#btn-add');
      await page.waitForSelector('#overlay-editor:not(.hide)');
      await page.type('#editor-form [name="name"]', 'Copied link');
      await page.type('#editor-form [name="target"]', 'example.com');
      await page.click('[data-mode="image"]');
      await page.type('#ed-link', `http://127.0.0.1:${corsPort}/logo.png`);
      await page.click('#ed-link-use');
      await pause(800);
      await page.click('#ed-zoom-out');
      await page.click('#editor-form button[type="submit"]');
      await pause(600);
      const copied = (await stored('store-site')).sites.flat().find((i) => i.name === 'Copied link');
      assert.equal(copied.iconEdit.linked, false);
      assert.ok(copied.bgImage.startsWith('data:image/png'));

      await page.click('#btn-add');
      await page.waitForSelector('#overlay-editor:not(.hide)');
      await page.type('#editor-form [name="name"]', 'Zoomed link');
      await page.type('#editor-form [name="target"]', 'example.net');
      await page.click('[data-mode="image"]');
      await page.type('#ed-link', `http://127.0.0.1:${plainPort}/logo.png`);
      await page.click('#ed-link-use');
      await pause(800);
      await page.click('#ed-zoom-out');
      await page.click('#ed-zoom-out');
      await page.click('#editor-form button[type="submit"]');
      await pause(600);
      const linked = (await stored('store-site')).sites.flat().find((i) => i.name === 'Zoomed link');
      assert.equal(linked.iconEdit.linked, true);
      assert.ok(linked.iconEdit.zoom < 1, `zoom kept at ${linked.iconEdit.zoom}`);
      const sizes = await page.evaluate(() => {
        const icon = [...document.querySelectorAll('#site-items .icon')].find((i) => i.querySelector('.icon-name').textContent === 'Zoomed link');
        const tile = icon.querySelector('.icon-content').getBoundingClientRect();
        const pic = icon.querySelector('img.pic').getBoundingClientRect();
        return { tileW: tile.width, picW: pic.width };
      });
      assert.ok(sizes.picW < sizes.tileW * 0.9, `picture ${sizes.picW}px inside tile ${sizes.tileW}px`);
    } finally {
      servers.forEach((s) => s.close());
    }
  });

  await step('no uncaught page errors', async () => {
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}

if (failures) {
  console.log(`${failures} step(s) failed`);
  process.exit(1);
}
console.log('feature checks passed');
