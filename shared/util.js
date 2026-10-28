export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Builds DOM nodes from an HTML string without innerHTML (which the add-on linter flags as
// unsafe). The DOMParser document is inert: nothing executes and no resource is fetched.
// Every string passed in must already escape its dynamic values with esc().
export function html(markup) {
  const doc = new DOMParser().parseFromString(`<template>${markup}</template>`, 'text/html');
  const frag = document.createDocumentFragment();
  frag.append(...doc.querySelector('template').content.childNodes);
  return frag;
}

// A link is kept as typed when it has a scheme such as http://, https:// or ftp://.
// Anything else ("example.com", "localhost:3000", "www.site.org/page") is treated as an https address.
export function normalizeUrl(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(data|blob):/i.test(s);
  const full = hasScheme ? s : `https://${s}`;
  try {
    new URL(full);
    return full;
  } catch {
    return null;
  }
}
export function isNewGridTarget(target) {
  return typeof target === 'string' && target.startsWith('newgrid://');
}

export function faviconUrl(target, size = 64) {
  return `${chrome.runtime.getURL('_favicon/')}?pageUrl=${encodeURIComponent(target)}&size=${size}`;
}

export function readFileAsDataUrl(file, maxBytes) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file'));
    if (maxBytes && file.size > maxBytes) return reject(new Error('File too large'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function downloadText(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

export function dayStart(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function hasPermission(name) {
  return new Promise((resolve) => {
    chrome.permissions.contains({ permissions: [name] }, (ok) => resolve(!!ok));
  });
}

export function requestPermission(name) {
  return new Promise((resolve) => {
    chrome.permissions.request({ permissions: [name] }, (ok) => resolve(!!ok));
  });
}

export function confirmAsync(message) {
  return Promise.resolve(window.confirm(message));
}
