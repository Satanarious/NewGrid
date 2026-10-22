// Single source of truth: chrome.storage.local, one key per store (same key names as the original extension).
export async function read(key, fallback) {
  const result = await chrome.storage.local.get(key);
  return result[key] !== undefined ? result[key] : structuredClone(fallback);
}

export async function write(key, value) {
  await chrome.storage.local.set({ [key]: value });
  return value;
}

export async function update(key, fallback, mutate) {
  const current = await read(key, fallback);
  const next = (await mutate(current)) ?? current;
  return write(key, next);
}

export function onKeyChange(key, callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && key in changes) callback(changes[key].newValue, changes[key].oldValue);
  });
}

export async function removeKeys(keys) {
  await chrome.storage.local.remove(keys);
}
