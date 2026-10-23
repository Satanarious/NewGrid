import { STORE_KEYS, DEFAULT_SEARCH, LOCAL_PAGES } from '../../shared/defaults.js';
import { read, write, onKeyChange } from '../../shared/storage.js';
import { mergeSetting, effectiveLayout } from '../../shared/settings.js';
import { normalize, defaultSite } from '../../shared/sites.js';
import { isNewGridTarget } from '../../shared/util.js';

export const state = {
  pages: [[]],
  setting: null,
  search: null,
  wallpaper: null,
  currentPage: 0,
  perms: { favicon: false },
};

export const hooks = {
  renderAll: () => {},
  renderGrid: () => {},
  renderBadges: () => {},
  renderWallpaper: () => {},
  renderSearch: () => {},
};

export function defaultPages() {
  const items = LOCAL_PAGES.map((p) =>
    defaultSite({
      name: p.name,
      target: p.target,
      type: isNewGridTarget(p.target) ? 'app' : 'web',
      bgType: 'color',
      bgColor: p.bgColor,
      bgText: p.bgText,
    }),
  );
  return normalize([items], items.length);
}

export async function loadAll() {
  const siteStore = await read(STORE_KEYS.site, { sites: null });
  state.pages = siteStore.sites && siteStore.sites.length ? siteStore.sites : defaultPages();
  const settingStore = await read(STORE_KEYS.setting, { setting: {} });
  state.setting = mergeSetting(settingStore.setting);
  state.search = await read(STORE_KEYS.search, DEFAULT_SEARCH);
  state.wallpaper = await read(STORE_KEYS.wallpaper, { mode: 'color', color: '#2d3142', library: [], index: 0, switchType: 'none', lastSwitch: 0 });
  state.pages = normalize(state.pages, effectiveLayout(state.setting).capacity);
  state.currentPage = Math.min(state.currentPage, state.pages.length - 1);
}

export function listenForChanges() {
  onKeyChange(STORE_KEYS.site, (v) => {
    if (!v || !v.sites) return;
    state.pages = normalize(v.sites, effectiveLayout(state.setting).capacity);
    hooks.renderGrid();
  });
  onKeyChange(STORE_KEYS.setting, (v) => {
    if (!v) return;
    state.setting = mergeSetting(v.setting);
    hooks.renderAll();
  });
  onKeyChange(STORE_KEYS.search, (v) => {
    if (!v) return;
    state.search = v;
    hooks.renderSearch();
  });
  onKeyChange(STORE_KEYS.wallpaper, (v) => {
    if (!v) return;
    state.wallpaper = v;
    hooks.renderWallpaper();
  });
}

export async function savePages(mutate) {
  const cap = effectiveLayout(state.setting).capacity;
  const pages = structuredClone(state.pages);
  const result = await mutate(pages);
  state.pages = normalize(pages, cap);
  state.currentPage = Math.min(state.currentPage, state.pages.length - 1);
  await write(STORE_KEYS.site, { sites: state.pages, redirectVersion: '', updatedIconVersion: '11.0.41' });
  hooks.renderGrid();
  return result;
}

export async function saveSetting(setting) {
  state.setting = setting;
  await write(STORE_KEYS.setting, { setting, updatetime: setting.updatetime });
  hooks.renderAll();
}

export async function saveSearch(search) {
  state.search = search;
  await write(STORE_KEYS.search, search);
  hooks.renderSearch();
}

export async function saveWallpaper(wallpaper) {
  state.wallpaper = wallpaper;
  await write(STORE_KEYS.wallpaper, wallpaper);
  hooks.renderWallpaper();
}
