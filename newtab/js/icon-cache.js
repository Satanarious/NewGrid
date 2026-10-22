import { read, write } from '../../shared/storage.js';
import { removeEdgeBackground } from '../../shared/bgremove.js';

// icon.horse sends CORS headers, so extension pages can read its pictures without any permission.
// That lets the background be removed. Google's icon service doesn't allow that, so it is only shown
// as it is when icon.horse can't be reached.
// v2: entries from the first version (Google only, often 32 px) are not reused.
const KEY = 'store-icon-cache-v2';
const SIZE = 256;

let cache = null;
const pending = new Map();

async function loadCache() {
  if (!cache) cache = await read(KEY, {});
  return cache;
}

async function fetchBitmap(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) return null;
  return createImageBitmap(blob);
}

// Returns a transparent-background PNG data URL for a domain, or null if no picture could be read.
export async function processedIcon(domain) {
  if (!domain) return null;
  const store = await loadCache();
  if (store[domain]) return store[domain];
  if (pending.has(domain)) return pending.get(domain);
  const job = (async () => {
    const bitmap = await fetchBitmap(`https://icon.horse/icon/${domain}`);
    if (!bitmap) return null;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Keep the whole picture, centred in the square (icons are usually square already).
    const scale = Math.min(SIZE / bitmap.width, SIZE / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
    const pixels = ctx.getImageData(0, 0, SIZE, SIZE);
    removeEdgeBackground(pixels.data, SIZE, SIZE);
    ctx.putImageData(pixels, 0, 0);
    const url = canvas.toDataURL('image/png');
    store[domain] = url;
    await write(KEY, store);
    return url;
  })().catch(() => null).finally(() => pending.delete(domain));
  pending.set(domain, job);
  return job;
}

// Swaps every website icon on the page for its processed version once it is ready.
export function upgradeIcons(root = document) {
  root.querySelectorAll('img.favicon[data-domain]').forEach(async (img) => {
    const url = await processedIcon(img.dataset.domain);
    if (url && img.isConnected) img.src = url;
  });
}
