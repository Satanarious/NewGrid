import { $, toast, html, normalizeUrl, isNewGridTarget } from '../../shared/util.js';
import { siteIconUrl, siteDomain } from '../../shared/icons.js';
import { processedIcon } from './icon-cache.js';

const STAGE = 340; // square stage in px
const TILE = 240; // the icon window, centred in the stage
const OUT = 256; // exported icon size
const MAX_SRC = 1024; // source pictures are downscaled to this before storing
const MAX_FILE = 15 * 1024 * 1024;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 6;
const NUDGE = 10;
const DEFAULT_ICON_SCALE = 0.7;
const PALETTE = ['transparent', '#ffffff', '#f5a623', '#e74c3c', '#7ed321', '#4a90e2', '#50e3c2', '#bd10e0', '#9013fe', '#417505', '#4a4a4a', '#000000'];

const ed = {
  mode: 'site',
  src: null,
  img: null,
  linked: false,
  natW: 0,
  natH: 0,
  zoom: 1,
  x: 0,
  y: 0,
  bg: 'transparent',
  text: '',
  textColor: '#ffffff',
  onSave: null,
  onDelete: null,
  drag: null,
  bound: false,
};

const el = {};

function grab() {
  el.overlay = $('#overlay-editor');
  el.form = $('#editor-form');
  el.nameIn = el.form.querySelector('[name="name"]');
  el.targetIn = el.form.querySelector('[name="target"]');
  el.stage = $('#ed-stage');
  el.full = $('#ed-full');
  el.tile = $('#ed-tile');
  el.tileImg = $('#ed-tile-img');
  for (const img of [el.full, el.tileImg]) img.draggable = false;
  el.stage.addEventListener('dragstart', (e) => e.preventDefault());
  el.tileText = $('#ed-tile-text');
  el.empty = $('#ed-empty');
  el.hint = $('#ed-hint');
  el.zoomLabel = $('#ed-zoom-label');
  el.file = $('#ed-file');
  el.text = $('#ed-text');
  el.textColor = $('#ed-text-color');
  el.palette = $('#ed-palette');
  el.previewLg = $('#ed-preview-lg');
  el.previewSm = $('#ed-preview-sm');
  el.title = el.overlay.querySelector('.editor-title');
  el.delete = el.overlay.querySelector('.delete-site');
}

// cors: ask for the picture with CORS so its pixels can be copied, when the site allows it.
function loadImage(src, cors = false) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function fileToSource(file) {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);
  const k = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const keepAlpha = /png|webp|gif/.test(file.type);
  return keepAlpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92);
}

async function setSource(src, linked = false) {
  const img = await loadImage(src);
  Object.assign(ed, { src, img, linked, natW: img.naturalWidth, natH: img.naturalHeight, mode: 'image', zoom: 1, x: 0, y: 0 });
  render();
}

// A picture from a web link. If the site allows it, the picture is copied into the editor and cropped like a file.
// If not, the link is kept together with its zoom and position, and the grid draws it the same way.
async function setLinkSource(url) {
  let img = null;
  try {
    img = await loadImage(url, true);
  } catch {
    img = null;
  }
  if (img) {
    try {
      const k = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      await setSource(c.toDataURL('image/png'), false);
      return true;
    } catch {
      // The copy was refused; fall through and keep the link.
    }
  }
  await setSource(url, true);
  return false;
}
// The website icon's size inside the window, following the Icon size setting so the editor matches the grid.
function siteBase() {
  const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--icon-scale'));
  return (Number.isFinite(s) && s > 0 ? s : DEFAULT_ICON_SCALE) * TILE;
}

// Stage pixels per unit of picture at a zoom level. Pictures use their natural size; website icons use their box.
function pxPerUnit(zoom) {
  if (ed.mode === 'site') return siteBase() * zoom;
  return Math.max(TILE / ed.natW, TILE / ed.natH) * zoom;
}

function textSize(px) {
  const n = Math.max(1, ed.text.length);
  const ratio = n <= 1 ? 0.55 : n === 2 ? 0.46 : n === 3 ? 0.37 : 0.3;
  return px * ratio;
}

// Zoom around a point of the stage so the spot under the cursor stays put.
function setZoom(zoom, cx = STAGE / 2, cy = STAGE / 2) {
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
  const hasPicture = ed.mode === 'site' || (ed.mode === 'image' && ed.natW);
  if (hasPicture) {
    const s0 = pxPerUnit(ed.zoom);
    const s1 = pxPerUnit(next);
    const ux = (cx - STAGE / 2 - ed.x) / s0;
    const uy = (cy - STAGE / 2 - ed.y) / s0;
    ed.x = cx - STAGE / 2 - ux * s1;
    ed.y = cy - STAGE / 2 - uy * s1;
  }
  ed.zoom = next;
  render();
}

function fit() {
  if (!ed.natW) return;
  ed.zoom = Math.min(TILE / ed.natW, TILE / ed.natH) / Math.max(TILE / ed.natW, TILE / ed.natH);
  ed.x = 0;
  ed.y = 0;
  render();
}

function fill() {
  ed.zoom = 1;
  ed.x = 0;
  ed.y = 0;
  render();
}

// Does the stage accept zoom and drag right now?
function movable() {
  return ed.mode === 'site' || (ed.mode === 'image' && !!ed.src);
}

function render() {
  const off = (STAGE - TILE) / 2;
  Object.assign(el.tile.style, { left: `${off}px`, top: `${off}px`, width: `${TILE}px`, height: `${TILE}px` });
  el.tile.classList.toggle('transparent', ed.bg === 'transparent');
  el.tile.style.background = ed.bg === 'transparent' ? '' : ed.bg;

  el.overlay.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === ed.mode));
  el.overlay.querySelectorAll('.ed-image-only').forEach((n) => n.classList.toggle('hide', ed.mode !== 'image'));
  el.overlay.querySelectorAll('.ed-zoom-only').forEach((n) => n.classList.toggle('hide', ed.mode === 'text'));
  el.overlay.querySelectorAll('.ed-text-only').forEach((n) => n.classList.toggle('hide', ed.mode !== 'text'));
  el.overlay.querySelectorAll('.ed-site-only').forEach((n) => n.classList.toggle('hide', ed.mode !== 'site'));

  const hasImage = ed.mode === 'image' && !!ed.src;
  const hasSite = ed.mode === 'site';
  el.full.classList.toggle('hide', !(hasImage || hasSite));
  el.tileImg.classList.toggle('hide', !(hasImage || hasSite));
  el.tileText.classList.toggle('hide', ed.mode !== 'text');
  el.empty.classList.toggle('hide', hasImage || ed.mode !== 'image');
  el.hint.classList.toggle('hide', !hasImage);

  if (hasImage) {
    const s = pxPerUnit(ed.zoom);
    const w = ed.natW * s;
    const h = ed.natH * s;
    if (el.tileImg.getAttribute('src') !== ed.src) el.tileImg.src = ed.src;
    Object.assign(el.full.style, { width: `${w}px`, height: `${h}px`, left: `${(STAGE - w) / 2 + ed.x}px`, top: `${(STAGE - h) / 2 + ed.y}px`, transform: '', objectFit: 'fill' });
    Object.assign(el.tileImg.style, { width: `${w}px`, height: `${h}px`, left: `${(TILE - w) / 2 + ed.x}px`, top: `${(TILE - h) / 2 + ed.y}px`, transform: '', objectFit: 'fill' });
  }
  if (hasSite) {
    // The icon is drawn in a box of the Icon size, then moved and zoomed. The same transform is used on the grid.
    const base = siteBase();
    const transform = `translate(${ed.x}px, ${ed.y}px) scale(${ed.zoom})`;
    Object.assign(el.full.style, { width: `${base}px`, height: `${base}px`, left: `${(STAGE - base) / 2}px`, top: `${(STAGE - base) / 2}px`, transform, objectFit: 'contain' });
    Object.assign(el.tileImg.style, { width: `${base}px`, height: `${base}px`, left: `${(TILE - base) / 2}px`, top: `${(TILE - base) / 2}px`, transform, objectFit: 'contain' });
    loadSiteIcon();
  }
  if (hasImage || hasSite) el.zoomLabel.textContent = `${Math.round(ed.zoom * 100)}%`;
  if (ed.mode === 'text') {
    el.tileText.textContent = ed.text;
    el.tileText.style.color = ed.textColor;
    el.tileText.style.fontSize = `${textSize(TILE)}px`;
  }
  el.palette.querySelectorAll('[data-bg]').forEach((b) => b.classList.toggle('active', b.dataset.bg === ed.bg));
  updatePreview();
}

// Website icon: the processed icon when access is granted, otherwise the plain one.
async function loadSiteIcon() {
  // The field may hold "github.com" without a scheme, so read it the same way the saved link is read.
  const domain = siteDomain(normalizeUrl(el.targetIn.value) || '');
  const plausible = /\.[a-z]{2,}$/i.test(domain);
  const url = siteIconUrl(domain ? `https://${domain}` : '', 256);
  if (!url) {
    el.tileImg.classList.add('hide');
    el.full.classList.add('hide');
    return;
  }
  el.tileImg.classList.remove('hide');
  el.full.classList.remove('hide');
  if (el.tileImg.getAttribute('src') !== url) el.tileImg.src = url;
  if (el.full.getAttribute('src') !== url) el.full.src = url;
  updatePreview();
  const processed = plausible ? await processedIcon(domain) : null;
  if (processed && ed.mode === 'site' && el.tileImg.isConnected && siteDomain(normalizeUrl(el.targetIn.value) || '') === domain) {
    el.tileImg.src = processed;
    el.full.src = processed;
    updatePreview();
  }
}

let previewFrame = 0;
function updatePreview() {
  cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(() => {
    const url = previewUrl();
    for (const [img, fallback] of [[el.previewLg, 96], [el.previewSm, 40]]) {
      const frame = img.parentElement;
      frame.classList.toggle('transparent', ed.bg === 'transparent');
      frame.style.background = ed.bg === 'transparent' ? '' : ed.bg;
      if (url) img.src = url;
      else img.removeAttribute('src');
      img.classList.toggle('empty', !url);
      placeInFrame(img, frame.offsetWidth || fallback);
    }
  });
}

// What the preview shows: the website icon, a linked picture kept with its zoom, or the finished picture.
function previewUrl() {
  if (ed.mode === 'site') return el.tileImg.getAttribute('src');
  if (ed.mode === 'image' && ed.src && ed.linked) return ed.src;
  return picturePreviewUrl();
}

// Places the preview picture in its frame of size P, the same way the window places it on the tile.
function placeInFrame(img, P) {
  const style = img.style;
  style.position = 'absolute';
  style.objectFit = 'fill';
  if (ed.mode === 'site') {
    const box = (siteBase() / TILE) * P * ed.zoom;
    Object.assign(style, { width: `${box}px`, height: `${box}px`, left: `${(P - box) / 2 + (ed.x / TILE) * P}px`, top: `${(P - box) / 2 + (ed.y / TILE) * P}px` });
  } else if (ed.mode === 'image' && ed.linked && ed.natW) {
    const s = (ed.zoom / Math.max(ed.natW, ed.natH)) * P;
    const w = ed.natW * s;
    const h = ed.natH * s;
    Object.assign(style, { width: `${w}px`, height: `${h}px`, left: `${(P - w) / 2 + (ed.x / TILE) * P}px`, top: `${(P - h) / 2 + (ed.y / TILE) * P}px` });
  } else {
    Object.assign(style, { width: '100%', height: '100%', left: '0px', top: '0px' });
  }
}

function picturePreviewUrl() {
  if ((ed.mode === 'image' && ed.src) || (ed.mode === 'text' && ed.text.trim())) return safeBake();
  return null;
}
// Linked pictures from sites that block copying can't be rendered to a canvas; they are shown as they are.
function safeBake() {
  try {
    return bake();
  } catch {
    return ed.linked ? ed.src : null;
  }
}

// The final picture, rendered at OUT px exactly as the window shows it.
function bake() {
  const c = document.createElement('canvas');
  c.width = OUT;
  c.height = OUT;
  const g = c.getContext('2d');
  const k = OUT / TILE;
  if (ed.bg !== 'transparent') {
    g.fillStyle = ed.bg;
    g.fillRect(0, 0, OUT, OUT);
  }
  if (ed.mode === 'image') {
    const s = pxPerUnit(ed.zoom) * k;
    const w = ed.natW * s;
    const h = ed.natH * s;
    g.drawImage(ed.img, OUT / 2 + ed.x * k - w / 2, OUT / 2 + ed.y * k - h / 2, w, h);
  } else {
    g.fillStyle = ed.textColor;
    g.font = `600 ${textSize(OUT)}px Outfit, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ed.text, OUT / 2, OUT / 2 + OUT * 0.02);
  }
  return c.toDataURL('image/png');
}

// ---- pointer, wheel, keyboard ----------------------------------------------

function stagePoint(e) {
  const r = el.stage.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * STAGE) / r.width, y: ((e.clientY - r.top) * STAGE) / r.height };
}

function bindStage() {
  el.stage.addEventListener('pointerdown', (e) => {
    if (!movable()) return;
    el.stage.setPointerCapture(e.pointerId);
    ed.drag = { sx: e.clientX, sy: e.clientY, x0: ed.x, y0: ed.y };
    el.stage.classList.add('grabbing');
  });
  el.stage.addEventListener('pointermove', (e) => {
    if (!ed.drag) return;
    const r = el.stage.getBoundingClientRect();
    const scale = STAGE / r.width;
    ed.x = ed.drag.x0 + (e.clientX - ed.drag.sx) * scale;
    ed.y = ed.drag.y0 + (e.clientY - ed.drag.sy) * scale;
    render();
  });
  const end = () => {
    ed.drag = null;
    el.stage.classList.remove('grabbing');
  };
  el.stage.addEventListener('pointerup', end);
  el.stage.addEventListener('pointercancel', end);
  el.stage.addEventListener('wheel', (e) => {
    if (!movable()) return;
    e.preventDefault();
    const p = stagePoint(e);
    // Windows mice send scroll in lines (deltaMode 1) and some browsers in pages; convert to pixels first,
    // then give every notch a clear step, whether it is a mouse notch or a trackpad flick.
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1;
    const dy = e.deltaY * unit;
    if (!dy) return;
    const amount = Math.sign(-dy) * Math.min(0.6, Math.max(0.02, Math.abs(dy) / 400));
    setZoom(ed.zoom * Math.exp(amount), p.x, p.y);
  }, { passive: false });
  el.stage.addEventListener('dblclick', () => {
    if (movable()) fill();
  });
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (el.overlay.classList.contains('hide') || !movable()) return;
    if (e.target.matches('input, textarea, select')) return;
    const step = e.shiftKey ? 1 : NUDGE;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      ed.x += moves[e.key][0];
      ed.y += moves[e.key][1];
      render();
    } else if (e.key === '+' || e.key === '=') {
      setZoom(ed.zoom * 1.1);
    } else if (e.key === '-') {
      setZoom(ed.zoom / 1.1);
    }
  });
}

function bindControls() {
  el.overlay.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    ed.mode = b.dataset.mode;
    if (ed.mode === 'site') Object.assign(ed, { zoom: 1, x: 0, y: 0 });
    render();
  }));
  el.file.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE) return toast('Image is too large (max 15 MB)');
    try {
      await setSource(await fileToSource(file));
    } catch {
      toast('Could not read that image');
    }
  });
  const useLink = async () => {
    const input = $('#ed-link');
    const url = normalizeUrl(input.value);
    if (!url) return toast('Enter a valid picture link');
    try {
      const copied = await setLinkSource(url);
      if (!copied) toast('This site does not allow copying its pictures, so the link is used as it is.');
    } catch {
      toast('Could not load a picture from that link');
    }
  };
  $('#ed-link-use').addEventListener('click', useLink);
  $('#ed-link').addEventListener('keydown', (e) => { if (e.key === 'Enter') useLink(); });
  $('#ed-fit').addEventListener('click', fit);
  $('#ed-fill').addEventListener('click', fill);
  $('#ed-zoom-in').addEventListener('click', () => setZoom(ed.zoom * 1.25));
  $('#ed-zoom-out').addEventListener('click', () => setZoom(ed.zoom / 1.25));
  el.text.addEventListener('input', (e) => {
    ed.text = e.target.value.slice(0, 4);
    if (e.target.value !== ed.text) e.target.value = ed.text;
    render();
  });
  el.textColor.addEventListener('input', (e) => {
    ed.textColor = e.target.value;
    render();
  });
  el.palette.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bg]');
    if (!b) return;
    ed.bg = b.dataset.bg;
    render();
  });
  el.palette.addEventListener('input', (e) => {
    if (e.target.id !== 'ed-custom-bg') return;
    ed.bg = e.target.value;
    render();
  });
  let typing = 0;
  el.targetIn.addEventListener('input', () => {
    // Wait until the typing pauses, so partial addresses like 'exampl' are not looked up.
    clearTimeout(typing);
    typing = setTimeout(() => ed.mode === 'site' && loadSiteIcon(), 450);
  });
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });
  el.overlay.querySelector('.cancel').addEventListener('click', closeIconEditor);
  el.overlay.querySelector('.close').addEventListener('click', closeIconEditor);
  el.delete.addEventListener('click', () => ed.onDelete && ed.onDelete());
  el.overlay.addEventListener('click', (e) => { if (e.target === el.overlay) closeIconEditor(); });
}

function bindOnce() {
  if (ed.bound) return;
  grab();
  bindStage();
  bindKeys();
  bindControls();
  // The stage keeps a fixed 340px coordinate system; zoom it to fit narrow windows.
  window.addEventListener('resize', fitStageZoom);
  ed.bound = true;
}

// Scale the stage down when its column is narrower than 340px. CSS zoom shrinks the whole
// stage with its children, and the pointer code already normalises by the rendered size.
function fitStageZoom() {
  if (!el.stage || el.overlay.classList.contains('hide')) return;
  const avail = el.stage.parentElement ? el.stage.parentElement.clientWidth : STAGE;
  const z = Math.min(1, avail / STAGE);
  el.stage.style.zoom = z < 0.999 ? z : '';
}

// ---- open, save, close ----------------------------------------------------

export async function openIconEditor(item, { onSave, onDelete } = {}) {
  bindOnce();
  ed.onSave = onSave;
  ed.onDelete = onDelete || null;
  Object.assign(ed, { src: null, img: null, linked: false, natW: 0, natH: 0, bg: 'transparent', zoom: 1, x: 0, y: 0, text: '', textColor: '#ffffff' });
  el.full.removeAttribute('src');
  el.tileImg.removeAttribute('src');
  el.form.reset();
  $('#ed-link').value = '';
  el.nameIn.value = item?.name || '';
  el.targetIn.value = item?.target || '';
  el.text.value = '';
  el.textColor.value = '#ffffff';
  el.title.textContent = item ? 'Edit icon' : 'Add site';
  el.delete.classList.toggle('hide', !item);
  el.palette.replaceChildren(html(PALETTE.map((c) => (c === 'transparent'
    ? '<button type="button" class="swatch none" data-bg="transparent" title="Transparent"></button>'
    : `<button type="button" class="swatch" style="background:${c}" data-bg="${c}" title="${c}"></button>`)).join('')
    + '<input type="color" id="ed-custom-bg" value="#4a90e2" title="Custom colour">'));

  const saved = item?.iconEdit;
  if (saved) {
    ed.bg = saved.bg || 'transparent';
    ed.text = saved.text || '';
    ed.textColor = saved.textColor || '#ffffff';
    el.text.value = ed.text;
    el.textColor.value = ed.textColor;
    if (saved.mode === 'image' && saved.src) {
      await setSource(saved.src, !!saved.linked);
      Object.assign(ed, { zoom: saved.zoom ?? 1, x: saved.x ?? 0, y: saved.y ?? 0, mode: 'image' });
    } else if (saved.mode === 'site') {
      Object.assign(ed, { mode: 'site', zoom: saved.zoom ?? 1, x: (saved.fx ?? 0) * TILE, y: (saved.fy ?? 0) * TILE });
    } else {
      ed.mode = saved.mode;
    }
  } else if (item && item.bgType === 'image' && item.bgImage) {
    await setSource(item.bgImage);
  } else if (item && item.bgText) {
    ed.mode = 'text';
    ed.text = item.bgText;
    ed.bg = item.bgColor || 'transparent';
    el.text.value = ed.text;
  } else {
    ed.mode = 'site';
    ed.bg = item?.bgColor && item.bgColor !== 'transparent' ? item.bgColor : 'transparent';
  }
  el.overlay.classList.remove('hide');
  fitStageZoom();
  el.nameIn.focus();
  render();
}

export function closeIconEditor() {
  if (!el.overlay) return;
  el.overlay.classList.add('hide');
  ed.onSave = null;
  ed.onDelete = null;
}

async function save() {
  const name = el.nameIn.value.trim();
  if (!name) return toast('Please enter a website name');
  const target = normalizeUrl(el.targetIn.value);
  if (!target) return toast('Enter a valid URL');
  const base = { name, target, type: isNewGridTarget(target) ? 'app' : 'web', updatetime: Date.now() };
  let patch;
  if (ed.mode === 'image') {
    if (!ed.src) return toast('Choose an image first');
    // A copied picture is saved as the finished icon. A linked picture is saved as its link, with the zoom and
    // position kept so the grid can draw it exactly as the window shows it.
    patch = {
      ...base,
      bgType: 'image',
      bgImage: ed.linked ? ed.src : bake(),
      bgColor: undefined,
      bgText: undefined,
      iconEdit: {
        mode: 'image',
        src: ed.src,
        linked: !!ed.linked,
        natW: ed.natW,
        natH: ed.natH,
        bg: ed.bg,
        zoom: ed.zoom,
        x: ed.x,
        y: ed.y,
        fx: ed.x / TILE,
        fy: ed.y / TILE,
      },
    };
  } else if (ed.mode === 'text') {
    if (!ed.text.trim()) return toast('Type the text for the icon');
    patch = {
      ...base,
      bgType: 'image',
      bgImage: bake(),
      bgColor: undefined,
      bgText: undefined,
      iconEdit: { mode: 'text', text: ed.text, textColor: ed.textColor, bg: ed.bg },
    };
  } else {
    // Website icon: the icon itself is kept as it is; its zoom and position are stored as fractions of the tile.
    patch = {
      ...base,
      bgType: 'color',
      bgColor: ed.bg,
      bgImage: undefined,
      bgText: undefined,
      iconEdit: { mode: 'site', bg: ed.bg, zoom: ed.zoom, fx: ed.x / TILE, fy: ed.y / TILE },
    };
  }
  const onSave = ed.onSave;
  closeIconEditor();
  if (onSave) await onSave(patch);
  toast('Saved');
}
