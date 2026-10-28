import { state, savePages } from './context.js';
import { $, esc, html, isNewGridTarget, toast } from '../../shared/util.js';
import {
  findPos, getItem, moveBefore, moveIntoFolder, mergeIntoFolder, destroyFolder,
  deleteFolder, renameFolder, addSite, defaultSite, removeById, findIconById,
} from '../../shared/sites.js';
import { effectiveLayout } from '../../shared/settings.js';
import { siteIconUrl, siteDomain } from '../../shared/icons.js';
import { upgradeIcons } from './icon-cache.js';
import { openTarget } from './launcher.js';
import { confirmDialog } from './confirm.js';
import { openIconEditor } from './icon-editor.js';

const dragState = { id: null, isFolder: false };
const modal = { folderId: null };

// A linked picture that can't be copied: drawn at the zoom and position chosen in the editor, clipped to the tile.
// --w and --h are the picture's size as a fraction of the tile, --fx and --fy its offset from the centre.
function pictureTile(item, tileClass) {
  const e = item.iconEdit;
  const largest = Math.max(e.natW, e.natH) || 1;
  const w = (e.zoom * e.natW) / largest;
  const h = (e.zoom * e.natH) / largest;
  const fx = e.fx ?? (e.x || 0) / TILE_EDITOR;
  const fy = e.fy ?? (e.y || 0) / TILE_EDITOR;
  const bg = e.bg || 'transparent';
  return `<div class="${tileClass} pic-tile" style="background-color:${esc(bg)}"><img class="pic" alt="" draggable="false" src="${esc(e.src)}" style="--w:${w};--h:${h};--fx:${fx};--fy:${fy}"></div>`;
}

// The icon editor works in a 240 px window; offsets are stored as fractions of that window.
const TILE_EDITOR = 240;

// Zoom and position chosen for a website icon, as CSS custom properties (fx and fy are fractions of the tile).
function siteTransform(item) {
  const edit = item.iconEdit;
  if (!edit || edit.mode !== 'site') return '';
  return `--z:${Number(edit.zoom) || 1};--fx:${Number(edit.fx) || 0};--fy:${Number(edit.fy) || 0}`;
}

// A transparent tile has no glass backdrop or shadow, so the icon floats on the wallpaper.
function clearTile(item) {
  if (item.bgType === 'image') return (item.iconEdit?.bg || 'transparent') === 'transparent';
  return (item.bgColor || 'transparent') === 'transparent';
}

function cssUrl(dataUrl) {
  return `url("${String(dataUrl).replace(/"/g, '%22')}")`;
}

// One tile: its background follows "Icon background size"; a glyph inside follows "Icon size".
function iconVisual(item) {
  const tileClass = clearTile(item) ? 'icon-content clear' : 'icon-content';
  if (item.iconEdit?.mode === 'image' && item.iconEdit.linked) return pictureTile(item, tileClass);
  const style = (extra = '') => `style="${esc(extra)}"`;
  if (item.bgType === 'image' && item.bgImage) {
    return `<div class="${tileClass}" ${style(`background-image:${cssUrl(item.bgImage)}`)}></div>`;
  }
  const bg = item.bgColor || 'transparent';
  const tileStyle = `background-color:${bg}`;
  if (item.bgText) {
    return `<div class="${tileClass}" ${style(tileStyle)}><span class="icon-text">${esc(item.bgText)}</span></div>`;
  }
  if (!isNewGridTarget(item.target) && item.target) {
    const letter = (item.name || '?').trim().charAt(0).toUpperCase() || '?';
    return `<div class="${tileClass}" ${style(tileStyle)}><img class="favicon" alt="" data-letter="${esc(letter)}" data-domain="${esc(siteDomain(item.target))}" src="${esc(siteIconUrl(item.target))}" style="${esc(siteTransform(item))}"></div>`;
  }
  const letter = (item.name || '?').trim().charAt(0).toUpperCase() || '?';
  return `<div class="${tileClass}" ${style(tileStyle)}><span class="icon-text">${esc(letter)}</span></div>`;
}

function renderIcon(item, page, index, style = '') {
  if (item.children) {
    const minis = item.children.slice(0, 9).map((child) => `<div class="mini-cell">${iconVisual(child)}</div>`).join('');
    return `
      <div class="icon folder" draggable="true" data-id="${esc(item.id)}" data-kind="folder" data-page="${page}" data-index="${index}" style="${style}">
        <div class="icon-content folder-box"><div class="mini-grid">${minis}</div></div>
        <div class="icon-name">${esc(item.name)}</div>
      </div>`;
  }
  return `
    <div class="icon" draggable="true" data-id="${esc(item.id)}" data-kind="site" data-page="${page}" data-index="${index}" style="${style}">
      ${iconVisual(item)}
      <div class="icon-name">${esc(item.name)}</div>
    </div>`;
}

// Each cell is placed on the grid: the whole block is centred in the page, and gaps can be negative.
function cellStyle(i, layout) {
  const cols = layout.col;
  const rows = layout.row;
  const c = i % cols;
  const r = Math.floor(i / cols);
  const left = `calc(50% - (${cols} * var(--t) + ${cols - 1} * var(--col-gap) * 1px) / 2 + ${c} * (var(--t) + var(--col-gap) * 1px))`;
  const top = `calc(50% - (${rows} * (var(--t) + 34px) + ${rows - 1} * var(--row-gap) * 1px) / 2 + ${r} * (var(--t) + 34px + var(--row-gap) * 1px))`;
  return `left:${left};top:${top}`;
}

export function renderGrid() {
  const track = $('#site-items');
  if (!track) return;
  const layout = effectiveLayout(state.setting);
  const cap = layout.capacity;
  track.replaceChildren(html(state.pages.map((page, p) => {
    const cells = [];
    for (let i = 0; i < cap; i++) {
      const style = cellStyle(i, layout);
      if (i < page.length) cells.push(renderIcon(page[i], p, i, style));
      else cells.push(`<div class="cell empty" data-drop-page="${p}" style="${style}"></div>`);
    }
    return `<div class="page" data-page="${p}"><div class="items-card"><div class="items-grid">${cells.join('')}</div></div></div>`;
  }).join('')));
  track.style.setProperty('--icon-col', layout.col);
  track.style.setProperty('--icon-row', layout.row);
  updatePages();
  renderDots();
  upgradeIcons(track);
  if (modal.folderId) renderFolderModal();
}

function renderDots() {
  const dots = $('#site-dots');
  if (!dots) return;
  dots.replaceChildren(html(state.pages.length > 1
    ? state.pages.map((_, p) => `<button class="dot${p === state.currentPage ? ' active' : ''}" data-goto="${p}" aria-label="Page ${p + 1}"></button>`).join('')
    : ''));
}

// ---- page turn animations -------------------------------------------------

const TRANSITIONS = {
  linear: 'transform 0.3s linear, opacity 0.3s linear',
  ease_in: 'transform 0.3s ease-in, opacity 0.3s ease-in',
  cubic_bezier: 'transform 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55), opacity 0.3s',
  fade: 'opacity 0.4s ease',
  zoom: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s',
  flip: 'transform 0.55s cubic-bezier(0.3, 0.7, 0.3, 1), opacity 0.3s',
  carousel: 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s',
  drop: 'transform 0.45s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.35s',
  blur: 'transform 0.4s ease, opacity 0.4s ease, filter 0.4s ease',
};

// d = page index minus the visible page. The visible page is d = 0.
function pageLook(anim, d) {
  const here = d === 0;
  switch (anim) {
    case 'fade':
      return { transform: 'none', opacity: here ? 1 : 0 };
    case 'zoom':
      return { transform: `scale(${here ? 1 : 0.6})`, opacity: here ? 1 : 0 };
    case 'flip':
      return { transform: `translateX(${d * 100}%) rotateY(${-d * 60}deg)`, opacity: 1 };
    case 'carousel':
      return { transform: `translateX(${d * 70}%) rotateY(${-d * 40}deg) scale(${here ? 1 : 0.85})`, opacity: Math.abs(d) <= 1 ? 1 : 0 };
    case 'drop':
      return { transform: `translateY(${d * 100}%)`, opacity: here ? 1 : 0 };
    case 'blur':
      return { transform: `translateX(${d * 12}%)`, opacity: here ? 1 : 0, filter: here ? 'none' : 'blur(10px)' };
    default:
      return { transform: `translateX(${d * 100}%)`, opacity: 1 };
  }
}

function updatePages() {
  const track = $('#site-items');
  if (!track) return;
  const anim = TRANSITIONS[state.setting.layout.easing] ? state.setting.layout.easing : 'linear';
  track.querySelectorAll('.page').forEach((page) => {
    const d = Number(page.dataset.page) - state.currentPage;
    const look = pageLook(anim, d);
    page.style.transition = TRANSITIONS[anim];
    page.style.transform = look.transform;
    page.style.opacity = look.opacity;
    page.style.filter = look.filter || '';
    page.style.zIndex = d === 0 ? 2 : 1;
    page.style.visibility = Math.abs(d) > 1 ? 'hidden' : 'visible';
    page.style.pointerEvents = d === 0 ? 'auto' : 'none';
  });
}

// ---- drag and drop -------------------------------------------------------

function dropZone(event, el) {
  const rect = el.getBoundingClientRect();
  const rx = (event.clientX - rect.left) / rect.width;
  const ry = (event.clientY - rect.top) / rect.height;
  return rx > 0.3 && rx < 0.7 && ry > 0.3 && ry < 0.7 ? 'merge' : 'before';
}

// Only top-level sites and folders can merge. Folder children and folder-to-site drops reorder.
function canMerge(icon) {
  return !dragState.isFolder && !icon.closest('.folder-items');
}

function clearDropMarks() {
  document.querySelectorAll('.drop-merge,.drop-before').forEach((el) => el.classList.remove('drop-merge', 'drop-before'));
}

function bindDnD(root) {
  root.addEventListener('dragstart', (e) => {
    const el = e.target.closest('.icon');
    if (!el) return;
    dragState.id = el.dataset.id;
    dragState.isFolder = el.dataset.kind === 'folder';
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', el.dataset.id);
  });

  root.addEventListener('dragend', () => {
    dragState.id = null;
    document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    clearDropMarks();
  });

  root.addEventListener('dragover', (e) => {
    if (!dragState.id) return;
    const icon = e.target.closest('.icon');
    const cell = e.target.closest('.cell.empty');
    if (!icon && !cell) return;
    e.preventDefault();
    clearDropMarks();
    if (cell) {
      cell.classList.add('drop-before');
      return;
    }
    if (icon.dataset.id === dragState.id) return;
    const zone = canMerge(icon) ? dropZone(e, icon) : 'before';
    icon.classList.add(zone === 'merge' ? 'drop-merge' : 'drop-before');
  });

  root.addEventListener('dragleave', (e) => {
    const el = e.target.closest?.('.icon,.cell');
    if (el && !el.contains(e.relatedTarget)) el.classList.remove('drop-merge', 'drop-before');
  });

  root.addEventListener('drop', async (e) => {
    if (!dragState.id) return;
    e.preventDefault();
    const dragId = dragState.id;
    const icon = e.target.closest('.icon');
    const cell = e.target.closest('.cell.empty');
    clearDropMarks();
    dragState.id = null;
    if (cell) {
      const page = Number(cell.dataset.dropPage);
      await savePages((pages) => moveBefore(pages, dragId, null, page));
      return;
    }
    if (!icon || icon.dataset.id === dragId) return;
    const targetId = icon.dataset.id;
    const zone = canMerge(icon) ? dropZone(e, icon) : 'before';
    if (zone === 'merge') {
      const targetIsFolder = icon.dataset.kind === 'folder';
      await savePages((pages) => {
        if (targetIsFolder) moveIntoFolder(pages, dragId, targetId);
        else mergeIntoFolder(pages, targetId, dragId, 'Folder');
      });
    } else {
      await savePages((pages) => moveBefore(pages, dragId, targetId, Number(icon.dataset.page)));
    }
  });
}

// ---- page turn -----------------------------------------------------------

export function goToPage(p) {
  const max = state.pages.length - 1;
  state.currentPage = Math.max(0, Math.min(max, p));
  updatePages();
  renderDots();
  const prev = $('#prev');
  const next = $('#next');
  if (prev) prev.disabled = state.currentPage === 0;
  if (next) next.disabled = state.currentPage >= max;
}

export function turnPage(delta) {
  goToPage(state.currentPage + delta);
}

// ---- folder dialog -------------------------------------------------------

export function openFolder(folderId) {
  modal.folderId = folderId;
  const overlay = $('#overlay-folder');
  overlay.classList.remove('hide');
  renderFolderModal();
  const box = overlay.querySelector('.box');
  box.classList.remove('flip-in');
  void box.offsetWidth;
  box.classList.add('flip-in');
}

export function closeFolder() {
  modal.folderId = null;
  $('#overlay-folder').classList.add('hide');
}

function renderFolderModal() {
  const folder = folderOf(modal.folderId);
  if (!folder) {
    if (modal.folderId) closeFolder();
    return;
  }
  const overlay = $('#overlay-folder');
  overlay.style.setProperty('--folder-cols', Math.min(6, Math.max(1, folder.children.length)));
  overlay.querySelector('.folder-name').value = folder.name;
  const items = overlay.querySelector('.folder-items');
  items.replaceChildren(html(folder.children.length
    ? folder.children.map((child, i) => `
        <div class="icon" draggable="true" data-id="${esc(child.id)}" data-kind="site" data-page="-1" data-index="${i}">
          ${iconVisual(child)}
          <div class="icon-name">${esc(child.name)}</div>
        </div>`).join('')
    : '<p class="empty">This folder is empty.</p>'));
  upgradeIcons(items);
}

function folderOf(id) {
  if (!id) return null;
  const item = findIconById(state.pages, id);
  return item && item.children ? item : null;
}

// ---- icon editor hookup ---------------------------------------------------

export function openEditor(id = null) {
  const item = id ? findIconById(state.pages, id) : null;
  openIconEditor(item, {
    onSave: async (patch) => {
      if (id) {
        await savePages((pages) => {
          const pos = findPos(pages, id);
          if (pos) Object.assign(getItem(pages, pos), patch);
        });
      } else {
        const item = defaultSite(patch);
        await savePages((pages) => {
          state.currentPage = addSite(pages, item, effectiveLayout(state.setting).capacity, state.currentPage);
        });
        goToPage(state.currentPage);
      }
    },
    onDelete: async () => {
      const ok = await confirmDialog({ title: 'Delete icon', message: 'Do you want to delete this icon?', okText: 'Delete', danger: true });
      if (!ok) return;
      await savePages((pages) => removeById(pages, id));
      $('#overlay-editor').classList.add('hide');
    },
  });
}

// ---- wiring --------------------------------------------------------------

export function bindGrid(openSiteTarget = openTarget) {
  const track = $('#site-items');
  bindDnD(track);
  bindDnD($('#overlay-folder .folder-items'));

  // Website icons that can't load fall back to their letter.
  track.addEventListener('error', (e) => {
    if (!e.target.matches || !e.target.matches('img.favicon')) return;
    const letter = e.target.dataset.letter || '?';
    e.target.replaceWith(Object.assign(document.createElement('span'), { className: 'icon-text', textContent: letter }));
  }, true);

  track.addEventListener('click', (e) => {
    const el = e.target.closest('.icon');
    if (!el) return;
    if (el.dataset.kind === 'folder') {
      openFolder(el.dataset.id);
      return;
    }
    const item = findIconById(state.pages, el.dataset.id);
    if (item) openSiteTarget(item, e);
  });

  track.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('.icon');
    if (!el || el.dataset.kind === 'folder') return;
    e.preventDefault();
    openEditor(el.dataset.id);
  });

  $('#overlay-folder .folder-items').addEventListener('click', (e) => {
    const el = e.target.closest('.icon');
    if (!el) return;
    const item = findIconById(state.pages, el.dataset.id);
    if (item) openSiteTarget(item, e);
  });

  $('#overlay-folder .folder-name').addEventListener('change', async (e) => {
    const name = e.target.value.trim();
    if (!name || !modal.folderId) return;
    await savePages((pages) => renameFolder(pages, modal.folderId, name));
  });

  $('#overlay-folder .open-all').addEventListener('click', () => {
    const folder = folderOf(modal.folderId);
    if (!folder) return;
    folder.children.forEach((child) => openSiteTarget(child, { ctrlKey: true }));
  });

  $('#overlay-folder .release').addEventListener('click', async () => {
    if (!modal.folderId) return;
    const ok = await confirmDialog({
      title: 'Release folder',
      message: 'The folder will be removed and its icons kept on the page. Are you sure?',
      okText: 'Release',
    });
    if (!ok) return;
    await savePages((pages) => destroyFolder(pages, modal.folderId));
    closeFolder();
    toast('Folder released');
  });

  $('#overlay-folder .delete-folder').addEventListener('click', async () => {
    if (!modal.folderId) return;
    const ok = await confirmDialog({
      title: 'Delete folder',
      message: 'Are you sure you want to delete this folder and everything in it?',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await savePages((pages) => deleteFolder(pages, modal.folderId));
    closeFolder();
  });

  $('#overlay-folder .folder-items').addEventListener('contextmenu', (e) => {
    const el = e.target.closest('.icon');
    if (!el) return;
    e.preventDefault();
    openEditor(el.dataset.id);
  });

  $('#overlay-folder .close').addEventListener('click', closeFolder);

  $('#site-dots').addEventListener('click', (e) => {
    const dot = e.target.closest('[data-goto]');
    if (dot) goToPage(Number(dot.dataset.goto));
  });

  const pagerDropDelay = (el, delta) => {
    let timer;
    el.addEventListener('dragenter', () => { timer = setTimeout(() => turnPage(delta), 600); });
    el.addEventListener('dragleave', () => clearTimeout(timer));
    el.addEventListener('drop', () => clearTimeout(timer));
  };
  pagerDropDelay($('#prev'), -1);
  pagerDropDelay($('#next'), 1);
}

