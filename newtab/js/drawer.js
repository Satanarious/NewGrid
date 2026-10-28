import { STORE_KEYS, DEFAULT_SEARCH } from '../../shared/defaults.js';
import { read, write } from '../../shared/storage.js';
import { state, saveSetting, saveSearch, saveWallpaper, savePages } from './context.js';
import { applyChange, getPath, mergeSetting, effectiveLayout } from '../../shared/settings.js';
import { esc, html, $, toast, downloadText } from '../../shared/util.js';
import { isValidTemplate } from '../../shared/search.js';
import { addSite } from '../../shared/sites.js';
import { confirmDialog, alertDialog } from './confirm.js';
import {
  sourceFor, addWallpaperFile, addWallpaperUrl, removeWallpaper,
  useWallpaper, setColor, nextWallpaper, downloadCurrent,
} from './wallpaper.js';

const PALETTE = ['#2d3142', '#ffffff', '#f5a623', '#e74c3c', '#7ed321', '#4a90e2', '#50e3c2', '#bd10e0', '#9013fe', '#417505', '#4a4a4a', '#000000'];
const SWITCH_OPTIONS = [['none', 'Off'], ['hour', 'Every hour'], ['12h', 'Every 12 hours'], ['day', 'Every 24 hours'], ['open', 'Each time a tab opens']];
const ANIM_OPTIONS = [
  ['linear', 'Slide'],
  ['ease_in', 'Slide, ease in'],
  ['cubic_bezier', 'Kick back'],
  ['fade', 'Fade'],
  ['zoom', 'Zoom'],
  ['flip', 'Flip'],
  ['carousel', 'Carousel'],
  ['drop', 'Drop'],
  ['blur', 'Blur'],
];
const BACKUP_VERSION = 1;

// [type, settings path, label, ...args]. A trailing "when" path hides the control unless that flag is on.
const SECTIONS = [
  {
    id: 'sec-link', title: 'Links',
    items: [
      ['bool', 'link.icon', 'Open website in new tab'],
      ['bool', 'link.search', 'Open search results in new tab'],
    ],
  },
  {
    id: 'sec-view', title: 'View',
    items: [
      ['bool', 'view.pagin', 'Page turn buttons'],
      ['range', 'view.scaleMain', 'Screen zoom', 0.6, 1.4, 0.05],
    ],
  },
  {
    id: 'sec-layout', title: 'Layout',
    items: [
      ['range', 'layout.colGap', 'Column spacing', -160, 160, 1],
      ['range', 'layout.rowGap', 'Row spacing', -160, 160, 1],
      ['bool', 'layout.custom', 'Customize layout'],
      ['range', 'layout.row', 'Rows', 1, 6, 1, 'layout.custom'],
      ['range', 'layout.col', 'Columns', 2, 10, 1, 'layout.custom'],
      ['select', 'layout.easing', 'Page turn animation', ANIM_OPTIONS],
    ],
  },
  {
    id: 'sec-icon', title: 'Icons',
    items: [
      ['range', 'icon.scale', 'Icon size', 0.2, 2, 0.05],
      ['range', 'icon.bgScale', 'Icon background size', 0.3, 1, 0.01],
      ['range', 'icon.radius', 'Icon rounded corners', 0, 0.5, 0.01],
      ['range', 'icon.opacity', 'Icon opacity', 0.2, 1, 0.02],
      ['bool', 'icon.shadow', 'Icon shadow'],
      ['bool', 'icon.startAnimation', 'Start animation'],
      ['bool', 'icon.miniMode', 'Minimalist mode (hide icons)'],
      ['bool', 'icon.isHideIconName', 'Hide icon names'],
    ],
  },
  {
    id: 'sec-search', title: 'Search box',
    items: [
      ['bool', 'search.hide', 'Hide search box'],
      ['bool', 'search.keepSearchInput', 'Keep search box contents'],
      ['bool', 'search.hideCategory', 'Hide search categories'],
      ['bool', 'search.hideButton', 'Hide search button'],
      ['bool', 'search.shadow', 'Search box shadow'],
      ['range', 'search.scale', 'Search box size', 0.5, 4, 0.05],
      ['range', 'search.radius', 'Search box rounded corners', 0, 0.5, 0.01],
      ['range', 'search.opacity', 'Search box opacity', 0.2, 1, 0.05],
    ],
  },
  {
    id: 'sec-font', title: 'Font',
    items: [
      ['bool', 'font.shadow', 'Text shadow'],
      ['range', 'font.size', 'Text size', 10, 30, 1],
      ['color', 'font.color', 'Font colour'],
    ],
  },
];

const drawer = { open: false };

export async function openDrawer(section) {
  drawer.open = true;
  $('#drawer').classList.add('open');
 renderDrawer();
  if (section) {
    const el = $(section === 'wallpaper' ? '#sec-wallpaper' : `#${section}`, $('#drawer'));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function closeDrawer() {
  drawer.open = false;
  $('#drawer').classList.remove('open');
}

export function isDrawerOpen() {
  return drawer.open;
}

export function toggleDrawer() {
  if (drawer.open) closeDrawer();
  else openDrawer();
}

function controlHtml(item) {
  const [type, path, label, a, b, c, when] = item;
  if (when && !getPath(state.setting, when)) return '';
  const id = `set-${path.replace(/\./g, '-')}`;
  const value = getPath(state.setting, path);
  if (type === 'bool') {
    return `<div class="field"><span>${esc(label)}</span><input type="checkbox" id="${id}" data-path="${path}" data-type="bool" ${value ? 'checked' : ''}></div>`;
  }
  if (type === 'range') {
    const decimals = c < 1 ? 2 : 0;
    return `<div class="field"><span class="lbl">${esc(label)}</span><span class="ctl"><input type="range" id="${id}" data-path="${path}" data-type="number" min="${a}" max="${b}" step="${c}" value="${value}"><output>${Number(value).toFixed(decimals)}</output></span></div>`;
  }
  if (type === 'select') {
    return `<div class="field"><span class="lbl">${esc(label)}</span><select id="${id}" data-path="${path}" data-type="string">${a.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  }
  if (type === 'color') {
    return `<div class="field"><span class="lbl">${esc(label)}</span><input type="color" id="${id}" data-path="${path}" data-type="string" value="${/^#/.test(value) ? value : '#dddddd'}"></div>`;
  }
  return '';
}

function renderDrawer() {
  const body = $('#drawer .drawer-body');
  const keep = body.scrollTop;
  const sections = SECTIONS.map((s) => `
    <section class="card" id="${s.id}">
      <h3>${esc(s.title)}</h3>
      ${s.items.map(controlHtml).join('')}
    </section>`).join('');
  body.replaceChildren(html(`${sections}${wallpaperCard()}${engineCard()}${backupCard()}`));
  bindDrawer(body);
  hydrateLibraryThumbs(body);
  body.scrollTop = keep;
}

// Rebuilds only the wallpaper card, so the library always matches storage.
export function refreshWallpaperCard() {
  if (!drawer.open) return;
  const old = $('#sec-wallpaper', $('#drawer'));
  if (!old) return;
  old.after(html(wallpaperCard()));
  old.remove();
  const fresh = $('#sec-wallpaper', $('#drawer'));
  bindWallpaper(fresh);
  hydrateLibraryThumbs(fresh);
}

// ---- wallpaper -----------------------------------------------------------

function wallpaperCard() {
  const wp = state.wallpaper;
  const color = wp.color || '#2d3142';
  return `
    <section class="card" id="sec-wallpaper">
      <h3>Wallpaper</h3>
      <div class="wp-group">
        <span class="wp-label">Colour</span>
        <div class="palette">
          ${PALETTE.map((c) => `<button class="swatch${wp.mode === 'color' && color === c ? ' active' : ''}" style="background:${c}" data-color="${c}" title="${c}"></button>`).join('')}
          <input type="color" id="wp-custom" value="${/^#/.test(color) ? color : '#2d3142'}" title="Custom colour">
        </div>
      </div>
      <div class="wp-group">
        <span class="wp-label">Image, GIF or video</span>
        <div class="library">${wp.library.length ? wp.library.map((item, i) => `
          <figure class="${wp.mode === 'library' && wp.index === i ? 'active' : ''}" data-id="${esc(item.id)}">
            ${item.kind === 'video'
              ? `<video class="thumb" data-thumb="${esc(item.id)}" muted preload="metadata"></video>`
              : `<img class="thumb" data-thumb="${esc(item.id)}" alt="">`}
            <figcaption><span class="use" data-use="${esc(item.id)}" title="${esc(item.name)}">${esc(item.name).slice(0, 16)}</span>
              <button class="link danger" data-drop="${esc(item.id)}">remove</button></figcaption>
          </figure>`).join('') : '<p class="empty">Nothing added yet</p>'}</div>
        <label class="btn-file wide">Add a file…<input type="file" id="wp-file" accept="image/*,video/*" hidden></label>
        <div class="link-row"><input id="wp-url" placeholder="or paste a link"><button id="wp-url-add">Add link</button></div>
      </div>
      <div class="wp-group">
        <span class="wp-label">Switching</span>
        <select id="wp-switch">${SWITCH_OPTIONS.map(([v, l]) => `<option value="${v}" ${wp.switchType === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <div class="row"><button id="wp-next">Next wallpaper</button><button id="wp-download">Download current</button></div>
      </div>
      ${controlHtml(['range', 'wallpaper.mask', 'Dim the wallpaper', 0, 0.8, 0.05])}
      ${controlHtml(['range', 'wallpaper.blur', 'Blur', 0, 20, 1])}
    </section>`;
}

async function hydrateLibraryThumbs(root) {
  for (const el of root.querySelectorAll('[data-thumb]')) {
    const item = state.wallpaper.library.find((i) => i.id === el.dataset.thumb);
    if (!item) continue;
    const src = await sourceFor(item);
    if (src) el.src = src;
  }
}

function bindWallpaper(root) {
  root.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => setColor(b.dataset.color)));
  root.querySelector('#wp-custom').addEventListener('change', (e) => setColor(e.target.value));
  root.querySelector('#wp-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    toast('Adding wallpaper...');
    await addWallpaperFile(file);
    e.target.value = '';
  });
  const addLink = async () => {
    const input = root.querySelector('#wp-url');
    if (!input.value.trim()) return;
    await addWallpaperUrl(input.value);
    input.value = '';
  };
  root.querySelector('#wp-url-add').addEventListener('click', addLink);
  root.querySelector('#wp-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') addLink(); });
  root.querySelectorAll('[data-use]').forEach((el) => el.addEventListener('click', () => useWallpaper(el.dataset.use)));
  root.querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Remove wallpaper', message: 'Remove this wallpaper from the library?', okText: 'Remove', danger: true });
    if (ok) await removeWallpaper(b.dataset.drop);
  }));
  root.querySelector('#wp-switch').addEventListener('change', (e) => saveWallpaper({ ...state.wallpaper, switchType: e.target.value, lastSwitch: Date.now() }));
  root.querySelector('#wp-next').addEventListener('click', () => nextWallpaper());
  root.querySelector('#wp-download').addEventListener('click', () => downloadCurrent());
  root.querySelectorAll('[data-path]').forEach((input) => bindSchemaInput(input));
}

// ---- custom engines ------------------------------------------------------

function engineCard() {
  const custom = state.search.searchEngine.custom || [];
  return `
    <section class="card" id="sec-engines">
      <h3>Custom search engines</h3>
      <p class="hint">Built-in engines are in the search box menu. Add your own here, using %s where the search words go.</p>
      <ul class="engine-list">${custom.length ? custom.map((e) => `
        <li><span>${esc(e.name)}</span><button class="link danger" data-del-engine="${esc(e.uuid)}">remove</button></li>`).join('') : '<li class="empty">No custom engines</li>'}</ul>
      <form id="engine-form" class="stack">
        <input name="name" placeholder="Name" required>
        <input name="template" placeholder="https://example.com/search?q=%s" required>
        <div><button type="submit">Add search engine</button></div>
      </form>
    </section>`;
}

function bindEngines(root) {
  root.querySelector('#engine-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const template = form.template.value.trim();
    if (!name) return toast('Enter search engine name');
    if (!isValidTemplate(template)) return toast('Format error: the link must contain %s');
    const search = structuredClone(state.search);
    search.searchEngine.custom.push({ uuid: 'custom-' + crypto.randomUUID(), name, desc: 'Custom', types: { html: template } });
    await saveSearch(search);
    renderDrawer();
    toast('Added');
  });
  root.querySelectorAll('[data-del-engine]').forEach((btn) => btn.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Remove search engine', message: 'Remove this search engine?', okText: 'Remove', danger: true });
    if (!ok) return;
    const search = structuredClone(state.search);
    search.searchEngine.custom = search.searchEngine.custom.filter((e) => e.uuid !== btn.dataset.delEngine);
    if (search.searchEngine.current === btn.dataset.delEngine) search.searchEngine.current = DEFAULT_SEARCH.searchEngine.current;
    await saveSearch(search);
    renderDrawer();
  }));
}

// ---- backup --------------------------------------------------------------

function backupCard() {
  return `
    <section class="card" id="sec-backup">
      <h3>Backup and recovery</h3>
      <div class="wp-group">
        <span class="wp-label">When importing</span>
        <div class="choice">
          <label><input type="radio" name="import-mode" value="overwrite" checked> Replace everything</label>
          <label><input type="radio" name="import-mode" value="merge"> Merge with what I have</label>
        </div>
      </div>
      <div class="backup-actions">
        <label class="btn-file wide">Import a backup file…<input type="file" id="import-file" accept=".json,application/json" hidden></label>
        <button id="btn-export" class="wide">Export backup</button>
        <button id="btn-reset" class="wide danger">Restore default settings</button>
      </div>
    </section>`;
}

const STORE_VALUES = Object.values(STORE_KEYS);

async function exportBackup() {
  const all = await chrome.storage.local.get(null);
  const data = {};
  for (const key of STORE_VALUES) if (all[key] !== undefined) data[key] = all[key];
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  downloadText(`newgrid-backup-${stamp}.json`, JSON.stringify({ version: BACKUP_VERSION, exportedAt: Date.now(), data }, null, 2));
}

// Imports as soon as a file is chosen. Problems are reported in a dialog; replacing data asks first.
async function importBackup(file) {
  if (!file) return;
  let payload = null;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    payload = null;
  }
  if (!payload || !payload.data || typeof payload.data !== 'object' || !Object.keys(payload.data).some((k) => STORE_VALUES.includes(k))) {
    return alertDialog({ title: 'Import failed', message: 'This file is not a NewGrid backup. Choose a file exported from NewGrid.' });
  }
  if (payload.version !== BACKUP_VERSION) {
    return alertDialog({ title: 'Import failed', message: `This backup was made by a different version (format ${payload.version}) and can't be imported.` });
  }
  const mode = document.querySelector('input[name="import-mode"]:checked')?.value || 'overwrite';
  if (mode === 'overwrite') {
    const ok = await confirmDialog({
      title: 'Replace everything?',
      message: 'Your current icons, folders, settings and wallpapers will be replaced by the backup.',
      okText: 'Replace',
      danger: true,
    });
    if (!ok) return;
    await chrome.storage.local.set(payload.data);
  } else {
    try {
      await mergeBackup(payload.data);
    } catch (err) {
      return alertDialog({ title: 'Import failed', message: `Could not merge the backup: ${err.message}` });
    }
  }
  await alertDialog({ title: 'Backup imported', message: 'Your data has been restored. NewGrid will now reload.' });
  location.reload();
}

async function mergeBackup(incoming) {
  const cap = effectiveLayout(state.setting).capacity;
  if (incoming[STORE_KEYS.site]?.sites) {
    const existing = new Set();
    for (const page of state.pages) {
      for (const item of page) {
        existing.add(item.uuid);
        (item.children || []).forEach((c) => existing.add(c.uuid));
      }
    }
    const pages = structuredClone(state.pages);
    let page = 0;
    for (const topItem of incoming[STORE_KEYS.site].sites.flat()) {
      const keys = [topItem.uuid, ...(topItem.children || []).map((c) => c.uuid)];
      if (keys.some((k) => existing.has(k))) continue;
      keys.forEach((k) => existing.add(k));
      page = addSite(pages, structuredClone(topItem), cap, page);
    }
    await write(STORE_KEYS.site, { sites: pages, redirectVersion: '', updatedIconVersion: '11.0.41' });
  }
  if (incoming[STORE_KEYS.search]) {
    const search = await read(STORE_KEYS.search, DEFAULT_SEARCH);
    const current = search.searchEngine;
    const uuids = new Set(current.custom.map((e) => e.uuid));
    current.custom.push(...(incoming[STORE_KEYS.search].searchEngine?.custom || []).filter((e) => !uuids.has(e.uuid)));
    await write(STORE_KEYS.search, { ...search, searchEngine: current });
  }
  for (const key of [STORE_KEYS.setting, STORE_KEYS.wallpaper]) {
    if (incoming[key]) await write(key, incoming[key]);
  }
}

function bindBackup(root) {
  root.querySelector('#btn-export').addEventListener('click', exportBackup);
  root.querySelector('#import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    importBackup(file);
  });
  root.querySelector('#btn-reset').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Restore defaults', message: 'Reset all settings to their default values? Your icons and wallpapers are kept.', okText: 'Reset', danger: true });
    if (!ok) return;
    await saveSetting(mergeSetting({}));
    await savePages(() => {});
    toast('Settings restored');
    renderDrawer();
  });
}

// ---- schema controls -----------------------------------------------------

function bindSchemaInput(input) {
  const handler = async () => {
    const path = input.dataset.path;
    let value;
    if (input.dataset.type === 'bool') value = input.checked;
    else if (input.dataset.type === 'number') value = Number(input.value);
    else value = input.value;
    if (input.type === 'range') {
      input.parentElement.querySelector('output').textContent = Number(value).toFixed(input.step < 1 ? 2 : 0);
    }
    const { setting, layoutChanged } = applyChange(state.setting, path, value);
    await saveSetting(setting);
    if (layoutChanged || path.startsWith('layout.')) await savePages(() => {});
    if (path === 'layout.custom') renderDrawer();
  };
  input.addEventListener(input.type === 'range' ? 'input' : 'change', handler);
}

function bindDrawer(root) {
  root.querySelectorAll('[data-path]').forEach((input) => {
    if (!input.closest('#sec-wallpaper')) bindSchemaInput(input);
  });
 bindWallpaper(root.querySelector('#sec-wallpaper'));
  bindEngines(root);
  bindBackup(root);
}

export function bindDrawerShell() {
  $('#drawer .close').addEventListener('click', closeDrawer);
  $('#btn-settings').addEventListener('click', toggleDrawer);
}
