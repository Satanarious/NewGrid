import { DEFAULT_SETTING } from './defaults.js';

// Grid size used when "Customize layout" is off.
export const LAYOUT_BASE = { row: 3, col: 6, colGap: 24, rowGap: 16 };

export function mergeSetting(stored = {}) {
  const out = {};
  for (const group of Object.keys(DEFAULT_SETTING)) {
    const base = DEFAULT_SETTING[group];
    if (typeof base !== 'object' || base === null) {
      out[group] = stored[group] ?? base;
      continue;
    }
    out[group] = {};
    for (const key of Object.keys(base)) {
      const value = stored[group]?.[key];
      out[group][key] = value !== undefined ? value : structuredClone(base[key]);
    }
  }
  return out;
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
  return obj;
}

// Grid geometry the page uses: columns = col, rows = row, gaps in px.
export function effectiveLayout(setting) {
  const L = setting.layout;
  const custom = !!L.custom;
  const row = custom ? L.row : LAYOUT_BASE.row;
  const col = custom ? L.col : LAYOUT_BASE.col;
  return {
    row,
    col,
    capacity: row * col,
    colGap: L.colGap,
    rowGap: L.rowGap,
  };
}

// Applies one setting change. layoutChanged tells the caller to repack pages.
export function applyChange(setting, path, value) {
  const before = effectiveLayout(setting).capacity;
  const next = structuredClone(setting);
  setPath(next, path, value);
  next.updatetime = Date.now();
  return { setting: next, layoutChanged: effectiveLayout(next).capacity !== before };
}
