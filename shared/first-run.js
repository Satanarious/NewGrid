import { STORE_KEYS } from './defaults.js';

// Silently applies default.json (a NewGrid backup) the first time the extension is installed.
// Runs once: the flag below is set after the import, and the import only happens on a fresh install.
export const FIRST_RUN_FLAG = 'newgrid-defaults-imported';
const BACKUP_VERSION = 1;
const STORE_VALUES = Object.values(STORE_KEYS);

export async function importFirstRunDefaults() {
  const state = await chrome.storage.local.get(FIRST_RUN_FLAG);
  if (state[FIRST_RUN_FLAG]) return false;

  let payload;
  try {
    const res = await fetch(chrome.runtime.getURL('default.json'));
    payload = await res.json();
  } catch {
    return false;
  }
  if (!payload || payload.version !== BACKUP_VERSION || !payload.data || typeof payload.data !== 'object') return false;

  const data = {};
  for (const key of STORE_VALUES) {
    if (payload.data[key] !== undefined) data[key] = payload.data[key];
  }
  await chrome.storage.local.set({ ...data, [FIRST_RUN_FLAG]: true });
  return true;
}
