import { state, saveWallpaper } from './context.js';
import { $, toast, normalizeUrl } from '../../shared/util.js';
import { putBlob, getBlob, deleteBlob } from '../../shared/blobstore.js';

const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
const VIDEO_URL = /\.(mp4|webm|ogv|mov|m4v)(?:[?#]|$)/i;

// Object URLs for stored blobs, keyed by wallpaper id. Revoked when the item is removed.
const objectUrls = new Map();
let renderToken = 0;

export function currentWallpaper() {
  const wp = state.wallpaper;
  if (wp.mode !== 'library' || !wp.library.length) return null;
  return wp.library[wp.index % wp.library.length] || wp.library[0];
}

export async function sourceFor(item) {
  if (item.source === 'url') return item.url;
  if (!objectUrls.has(item.id)) {
    const blob = await getBlob(item.key);
    if (!blob) return null;
    objectUrls.set(item.id, URL.createObjectURL(blob));
  }
  return objectUrls.get(item.id);
}

export function initWallpaper() {
  const video = $('#wp-video');
  const img = $('#wp-img');
  const onError = () => toast('Could not load this wallpaper');
  video.addEventListener('error', onError);
  img.addEventListener('error', onError);
  // Pause videos while the tab is hidden so a background new tab costs nothing.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause();
    else if (video.getAttribute('src')) video.play().catch(() => {});
  });
}

export async function renderWallpaper() {
  const token = ++renderToken;
  const wp = state.wallpaper;
  const wrap = $('#wallpaper');
  const img = $('#wp-img');
  const video = $('#wp-video');
  wrap.style.backgroundColor = wp.color || '#2d3142';
  const item = currentWallpaper();
  wrap.classList.remove('show-img', 'show-video');
  if (!item) {
    video.pause();
    video.removeAttribute('src');
    img.removeAttribute('src');
    return;
  }
  const src = await sourceFor(item);
  if (token !== renderToken || !src) return;
  if (item.kind === 'video') {
    img.removeAttribute('src');
    if (video.getAttribute('src') !== src) {
      video.src = src;
      video.load();
    }
    wrap.classList.add('show-video');
    video.play().catch(() => {});
  } else {
    video.pause();
    video.removeAttribute('src');
    if (img.getAttribute('src') !== src) img.src = src;
    wrap.classList.add('show-img');
  }
}

function kindOfFile(file) {
  return file.type.startsWith('video/') ? 'video' : 'image';
}

export async function addWallpaperFile(file) {
  const kind = kindOfFile(file);
  const limit = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    toast(`File is too large (max ${Math.round(limit / 1048576)} MB)`);
    return;
  }
  const id = crypto.randomUUID();
  const key = `wp-${id}`;
  await putBlob(key, file);
  const item = { id, name: file.name, kind, source: 'file', key };
  await addItem(item);
}

export async function addWallpaperUrl(input) {
  const url = normalizeUrl(input);
  if (!url) {
    toast('Please enter a valid link');
    return;
  }
  const kind = VIDEO_URL.test(url) ? 'video' : 'image';
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || url);
  await addItem({ id: crypto.randomUUID(), name, kind, source: 'url', url });
}

async function addItem(item) {
  const wp = state.wallpaper;
  const library = [...wp.library, item];
  await saveWallpaper({ ...wp, mode: 'library', library, index: library.length - 1, lastSwitch: Date.now() });
}

export async function removeWallpaper(id) {
  const wp = state.wallpaper;
  const item = wp.library.find((i) => i.id === id);
  if (!item) return;
  if (item.source === 'file') await deleteBlob(item.key);
  if (objectUrls.has(id)) {
    URL.revokeObjectURL(objectUrls.get(id));
    objectUrls.delete(id);
  }
  const library = wp.library.filter((i) => i.id !== id);
  await saveWallpaper({ ...wp, library, mode: library.length ? wp.mode : 'color', index: 0 });
}

export async function useWallpaper(id) {
  const wp = state.wallpaper;
  const index = wp.library.findIndex((i) => i.id === id);
  if (index < 0) return;
  await saveWallpaper({ ...wp, mode: 'library', index });
}

export async function setColor(color) {
  await saveWallpaper({ ...state.wallpaper, mode: 'color', color });
}

export async function nextWallpaper() {
  const wp = state.wallpaper;
  if (wp.library.length < 2) return;
  const offset = 1 + Math.floor(Math.random() * (wp.library.length - 1));
  const index = (wp.index + offset) % wp.library.length;
  await saveWallpaper({ ...wp, mode: 'library', index, lastSwitch: Date.now() });
}

export async function autoSwitchIfDue() {
  const wp = state.wallpaper;
  if (!wp.library.length || wp.switchType === 'none') return;
  const intervals = { hour: 3600e3, '12h': 12 * 3600e3, day: 24 * 3600e3 };
  const due = wp.switchType === 'open' || Date.now() - (wp.lastSwitch || 0) >= (intervals[wp.switchType] || Infinity);
  if (due) await nextWallpaper();
}

export async function downloadCurrent() {
  const item = currentWallpaper();
  if (!item) return toast('Nothing to download');
  const url = await sourceFor(item);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.name || 'wallpaper';
  a.click();
}
