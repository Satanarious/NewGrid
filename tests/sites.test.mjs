import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addSite, capacityOf, defaultSite, destroyFolder, findPos, mergeIntoFolder, moveBefore,
  moveIntoFolder, normalize, allSites, deleteFolder,
} from '../shared/sites.js';
import { applyChange, effectiveLayout, mergeSetting, LAYOUT_BASE } from '../shared/settings.js';
import { buildSearchUrl, isValidTemplate } from '../shared/search.js';
import { BUILTIN_ENGINES, DEFAULT_SETTING } from '../shared/defaults.js';

const site = (name) => defaultSite({ name, target: `https://${name}.example/` });
const names = (pages) => pages.map((p) => p.map((i) => (i.children ? `[${i.name}:${i.children.map((c) => c.name).join(',')}]` : i.name)));

test('capacity is row * col with the default 3 x 6 layout', () => {
  assert.equal(capacityOf(DEFAULT_SETTING.layout), 18);
});

test('addSite fills pages in order and opens a new page when full', () => {
  const pages = [[]];
  const cap = 2;
  for (const n of ['a', 'b', 'c']) addSite(pages, site(n), cap, 0);
  assert.deepEqual(names(pages), [['a', 'b'], ['c']]);
});

test('normalize splits overflow into the next page and drops empty pages', () => {
  const pages = [[site('a'), site('b'), site('c')], [], [site('d')]];
  normalize(pages, 2);
  assert.deepEqual(names(pages), [['a', 'b'], ['c'], ['d']]);
});

test('normalize unwraps single-child folders and removes empty folders', () => {
  const folder = { id: 'f1', uuid: 'u', name: 'F', children: [site('solo')] };
  const empty = { id: 'f2', uuid: 'v', name: 'E', children: [] };
  const pages = [[folder, empty, site('x')]];
  normalize(pages, 6);
  assert.deepEqual(names(pages), [['solo', 'x']]);
});

test('merging two top-level sites creates a folder holding both, in order', () => {
  const pages = [[site('a'), site('b'), site('c')]];
  const a = pages[0][0];
  const b = pages[0][1];
  const folderId = mergeIntoFolder(pages, a.id, b.id, 'Folder', 1);
  assert.ok(folderId);
  assert.deepEqual(names(pages), [['[Folder:a,b]', 'c']]);
});

test('merging onto a folder child never drops the dragged site', () => {
  const pages = [[site('a'), site('b'), site('c')]];
  mergeIntoFolder(pages, pages[0][0].id, pages[0][1].id, 'Folder', 1);
  const childId = pages[0][0].children[1].id;
  const cId = pages[0][1].id;
  assert.equal(mergeIntoFolder(pages, childId, cId, 'Folder', 2), null);
  assert.equal(allSites(pages).length, 3);
});

test('merging onto a site that comes after the dragged item keeps the target', () => {
  const pages = [[site('a'), site('b'), site('c')]];
  mergeIntoFolder(pages, pages[0][1].id, pages[0][0].id, 'Folder', 1);
  assert.deepEqual(names(pages), [['[Folder:b,a]', 'c']]);
  assert.equal(allSites(pages).length, 3);
});

test('dropping onto a folder appends into it', () => {
  const pages = [[site('a'), site('b'), site('c')]];
  const folderId = mergeIntoFolder(pages, pages[0][0].id, pages[0][1].id, 'Folder', 1);
  moveIntoFolder(pages, pages[0][1].id, folderId, 2);
  assert.deepEqual(names(pages), [['[Folder:a,b,c]']]);
});

test('a folder dropped before another item reorders the grid', () => {
  const pages = [[site('a'), site('b'), site('c')]];
  const folderId = mergeIntoFolder(pages, pages[0][0].id, pages[0][1].id, 'Folder', 1);
  const c = pages[0][1];
  moveBefore(pages, c.id, folderId, 0);
  assert.deepEqual(names(pages), [['c', '[Folder:a,b]']]);
});

test('destroyFolder releases children in place', () => {
  const pages = [[site('a'), site('b'), site('c')]];
  const folderId = mergeIntoFolder(pages, pages[0][0].id, pages[0][1].id, 'Folder', 1);
  destroyFolder(pages, folderId);
  assert.deepEqual(names(pages), [['a', 'b', 'c']]);
});

test('deleteFolder removes the folder and everything inside', () => {
  const pages = [[site('a'), site('b'), site('c')]];
  const folderId = mergeIntoFolder(pages, pages[0][0].id, pages[0][1].id, 'Folder', 1);
  deleteFolder(pages, folderId);
  assert.deepEqual(names(pages), [['c']]);
});

test('findPos returns [page, index] for top-level items and [page, index, child] for folder children', () => {
  const pages = [[site('a'), site('b')]];
  const folderId = mergeIntoFolder(pages, pages[0][0].id, pages[0][1].id, 'Folder', 1);
  const childId = pages[0][0].children[1].id;
  assert.deepEqual(findPos(pages, folderId), [0, 0]);
  assert.deepEqual(findPos(pages, childId), [0, 0, 1]);
  assert.equal(findPos(pages, 'missing'), null);
});

test('moving a folder child out of a folder to a page slot keeps every site', () => {
  const pages = [[site('a'), site('b'), site('c')]];
  mergeIntoFolder(pages, pages[0][0].id, pages[0][1].id, 'Folder', 1);
  const bId = pages[0][0].children[1].id;
  moveBefore(pages, bId, pages[0][1].id, 0);
  assert.equal(allSites(pages).length, 3);
});

test('applyChange reports a capacity change only when the custom grid changes size', () => {
  const custom = mergeSetting({ layout: { custom: true } });
  const grown = applyChange(custom, 'layout.col', 8);
  assert.equal(grown.setting.layout.col, 8);
  assert.equal(grown.layoutChanged, true);
  const same = applyChange(custom, 'view.pagin', true);
  assert.equal(same.layoutChanged, false);
  assert.equal(same.setting.view.pagin, true);
});

test('with Customize layout off the grid is the default 3 x 6 whatever the stored values are', () => {
  const off = mergeSetting({ layout: { custom: false, row: 5, col: 9, colGap: 150, rowGap: 0 } });
  const geometry = effectiveLayout(off);
  assert.equal(geometry.row, LAYOUT_BASE.row);
  assert.equal(geometry.col, LAYOUT_BASE.col);
  assert.equal(geometry.colGap, 150);
  assert.equal(geometry.capacity, 18);
});

test('with Customize layout on the stored rows, columns and spacing are used', () => {
  const on = mergeSetting({ layout: { custom: true, row: 2, col: 4, colGap: 0, rowGap: 160 } });
  const geometry = effectiveLayout(on);
  assert.equal(geometry.capacity, 8);
  assert.equal(geometry.colGap, 0);
  assert.equal(geometry.rowGap, 160);
});

test('the icon background and glyph sizes default to separate settings', () => {
  const s = mergeSetting({});
  assert.ok(s.icon.bgScale > 0 && s.icon.bgScale <= 1);
  assert.ok(s.icon.scale > 0 && s.icon.scale <= 1);
  assert.equal('notice' in s, false);
  assert.equal('bookmark' in s.link, false);
  assert.equal('topBookmark' in s.view, false);
});
test('search templates replace %s with the encoded query', () => {
  const google = BUILTIN_ENGINES.find((e) => e.uuid === 'google');
  assert.equal(buildSearchUrl(google.types.html, 'a b&c'), 'https://www.google.com/search?q=a%20b%26c');
  assert.equal(isValidTemplate('https://x.test/?q=%s'), true);
  assert.equal(isValidTemplate('https://x.test/'), false);
  assert.equal(isValidTemplate('not a url %s'), false);
});

import { removeEdgeBackground } from '../shared/bgremove.js';

function solid(w, h, rgba) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set(rgba, i * 4);
  return d;
}

test('a white background is made transparent while the artwork inside is kept', () => {
  const w = 8;
  const h = 8;
  const d = solid(w, h, [255, 255, 255, 255]);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) d.set([200, 20, 20, 255], (y * w + x) * 4);
  assert.equal(removeEdgeBackground(d, w, h), true);
  assert.equal(d[3], 0);
  assert.equal(d[(0 * w + 0) * 4 + 3], 0);
  assert.equal(d[(3 * w + 3) * 4 + 3], 255);
});

test('an icon that already has a transparent edge is left alone', () => {
  const w = 4;
  const h = 4;
  const d = solid(w, h, [255, 255, 255, 255]);
  d.set([0, 0, 0, 0], 0);
  const before = d.slice();
  assert.equal(removeEdgeBackground(d, w, h), false);
  assert.deepEqual(d, before);
});

import { normalizeUrl } from '../shared/util.js';

test('links keep their scheme and bare or host:port addresses become https', () => {
  assert.equal(normalizeUrl('http://example.com/a'), 'http://example.com/a');
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com');
  assert.equal(normalizeUrl('example.com'), 'https://example.com');
  assert.equal(normalizeUrl('localhost:3000'), 'https://localhost:3000');
  assert.equal(normalizeUrl('www.site.org:8080/page'), 'https://www.site.org:8080/page');
  assert.equal(normalizeUrl('   '), null);
});
