import { state, hooks, loadAll, listenForChanges, saveSearch } from './context.js';
import { renderGrid, bindGrid, goToPage, turnPage, openEditor, closeFolder } from './grid.js';
import { closeIconEditor } from './icon-editor.js';
import { bindDrawerShell, closeDrawer, isDrawerOpen, refreshWallpaperCard } from './drawer.js';
import { $, esc, html } from '../../shared/util.js';
import { allEngines, findEngine, availableTypes, engineTemplate, buildSearchUrl, SEARCH_TYPE_LABELS } from '../../shared/search.js';
import { effectiveLayout } from '../../shared/settings.js';
import { initWallpaper, renderWallpaper, autoSwitchIfDue } from './wallpaper.js';

const DRAFT_KEY = 'search-input-draft';
const EASING = {
  linear: 'transform 0.3s linear',
  ease_in: 'transform 0.3s ease-in',
  cubic_bezier: 'transform 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55)',
};
let searchType = 'html';

function renderStyle() {
  const s = state.setting;
  const layout = effectiveLayout(s);
  const root = document.documentElement;
  const vars = {
    '--icon-col': layout.col,
    '--icon-row': layout.row,
    '--col-gap': layout.colGap,
    '--row-gap': layout.rowGap,
    '--bg-scale': s.icon.bgScale,
    '--icon-scale': s.icon.scale,
    '--icon-opacity': s.icon.opacity,
    '--icon-radius': s.icon.radius,
    '--search-scale': s.search.scale,
    '--search-opacity': s.search.opacity,
    '--search-radius': s.search.radius,
    '--scale-main': s.view.scaleMain,
    '--font-size': s.font.size,
    '--font-color': s.font.color,
    '--font-shadow': s.font.shadow ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none',
    '--mask': s.wallpaper.mask,
    '--wp-blur': `${s.wallpaper.blur}px`,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  document.body.classList.toggle('show-pager', !!s.view.pagin);
  document.body.classList.toggle('hide-names', !!s.icon.isHideIconName);
  document.body.classList.toggle('hide-icons', !!s.icon.miniMode);
  document.body.classList.toggle('icon-shadow', !!s.icon.shadow);
  document.body.dataset.easing = EASING[s.layout.easing] ? s.layout.easing : 'linear';
}

function renderSearch() {
  const s = state.setting.search;
  const wrap = $('.search-wrap');
  const form = $('#search-form');
  wrap.classList.toggle('hide', !!s.hide);
  form.classList.toggle('shadow', !!s.shadow);
  form.classList.toggle('hide-button', !!s.hideButton);
  wrap.classList.toggle('hide-category', !!s.hideCategory);
  const engine = findEngine(state.search, state.search.searchEngine.current);
  const types = availableTypes(engine);
  if (!types.includes(searchType)) searchType = 'html';
  $('#engine-btn').textContent = `${engine.name} ▾`;
  $('#type-tabs').replaceChildren(html(types
    .map((t) => `<button type="button" data-type="${t}" class="${t === searchType ? 'active' : ''}">${SEARCH_TYPE_LABELS[t]}</button>`)
    .join('')));
  alignTabs();
  const input = $('#search-input');
  if (s.keepSearchInput && document.activeElement !== input) input.value = localStorage.getItem(DRAFT_KEY) || '';
}

// Lines the category tabs up with the text in the search input (just after the engine button).
function alignTabs() {
  const engine = document.querySelector('.search-engine');
  const input = $('#search-input');
  const tabs = $('#type-tabs');
  if (!engine || !input) return;
  const inputPad = parseFloat(getComputedStyle(input).paddingLeft) || 0;
  tabs.style.paddingLeft = `${engine.offsetWidth + inputPad}px`;
}

function renderEngineMenu() {
  const current = state.search.searchEngine.current;
  $('#engine-menu').replaceChildren(html(allEngines(state.search)
    .map((e) => `<button type="button" data-engine="${esc(e.uuid)}" class="${e.uuid === current ? 'active' : ''}">${esc(e.name)}</button>`)
    .join('')));
}

function renderAll() {
  renderStyle();
  renderWallpaper();
  renderSearch();
  renderGrid();
  goToPage(state.currentPage);
}

function bindSearch() {
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#search-input').value.trim();
    if (!q) return;
    const engine = findEngine(state.search, state.search.searchEngine.current);
    const url = buildSearchUrl(engineTemplate(engine, searchType), q);
    if (state.setting.link.search) chrome.tabs.create({ url });
    else window.location.href = url;
  });

  $('#engine-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    renderEngineMenu();
    $('#engine-menu').classList.toggle('hide');
  });
  $('#engine-menu').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-engine]');
    if (!btn) return;
    const search = structuredClone(state.search);
    search.searchEngine.current = btn.dataset.engine;
    $('#engine-menu').classList.add('hide');
    searchType = 'html';
    await saveSearch(search);
  });
  $('#type-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    searchType = btn.dataset.type;
    renderSearch();
  });
  document.addEventListener('click', () => $('#engine-menu').classList.add('hide'));
  $('#search-input').addEventListener('input', (e) => {
    if (state.setting.search.keepSearchInput) localStorage.setItem(DRAFT_KEY, e.target.value);
  });
  new ResizeObserver(() => alignTabs()).observe($('.search-card'));
}

function bindChrome() {
  $('#btn-add').addEventListener('click', () => openEditor(null));
  $('#prev').addEventListener('click', () => turnPage(-1));
  $('#next').addEventListener('click', () => turnPage(1));

  let last = 0;
  $('#main').addEventListener('wheel', (e) => {
    if (document.querySelector('.overlay:not(.hide)') || isDrawerOpen()) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 20) return;
    const now = Date.now();
    if (now - last < 450) return;
    last = now;
    turnPage(delta > 0 ? 1 : -1);
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#overlay-editor').classList.contains('hide')) return closeIconEditor();
      if (!$('#overlay-folder').classList.contains('hide')) return closeFolder();
      if (isDrawerOpen()) return closeDrawer();
    }
    if (e.target.matches('input, textarea, select') || document.querySelector('.overlay:not(.hide)')) return;
    if (e.key === 'ArrowRight') turnPage(1);
    if (e.key === 'ArrowLeft') turnPage(-1);
  });

  document.querySelectorAll('.overlay').forEach((ov) => ov.addEventListener('click', (e) => {
    if (e.target !== ov) return;
    if (ov.id === 'overlay-folder') closeFolder();
  }));
}

function startAnimation() {
  if (!state.setting.icon.startAnimation) return;
  const box = $('#site-box');
  box.classList.add('start-animate');
  box.addEventListener('animationend', () => box.classList.remove('start-animate'), { once: true });
}

async function boot() {
  await loadAll();

  hooks.renderAll = renderAll;
  hooks.renderGrid = renderGrid;
  hooks.renderBadges = () => {};
  hooks.renderWallpaper = () => {
    renderWallpaper();
    refreshWallpaperCard();
  };
  hooks.renderSearch = renderSearch;

  initWallpaper();
  bindGrid();
  bindDrawerShell();
  bindSearch();
  bindChrome();
  listenForChanges();
  renderAll();
  startAnimation();
  autoSwitchIfDue();
}

boot().catch((err) => {
  console.error(err);
  document.body.append(html(`<p style="position:fixed;bottom:8px;left:8px">Failed to load: ${esc(err.message)}</p>`));
});
