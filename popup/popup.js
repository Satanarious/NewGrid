import { STORE_KEYS } from '../shared/defaults.js';
import { read, write } from '../shared/storage.js';
import { mergeSetting } from '../shared/settings.js';
import { addSite, capacityOf, defaultSite, normalize } from '../shared/sites.js';
import { normalizeUrl } from '../shared/util.js';

const status = document.getElementById('status');
const nameInput = document.getElementById('name');
const urlInput = document.getElementById('url');

async function prefill() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  nameInput.value = (tab.title || '').trim() || tab.url || '';
  urlInput.value = tab.url || '';
}

document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const target = normalizeUrl(urlInput.value);
  if (!name) return setStatus('Please enter website name', true);
  if (!target) return setStatus('Format error', true);

  const siteStore = await read(STORE_KEYS.site, { sites: [] });
  const settingStore = await read(STORE_KEYS.setting, { setting: {} });
  const setting = mergeSetting(settingStore.setting);
  const pages = normalize(siteStore.sites && siteStore.sites.length ? siteStore.sites : [[]], capacityOf(setting.layout));

  addSite(pages, defaultSite({ name, target, type: 'web', bgType: 'color', bgColor: 'transparent' }), capacityOf(setting.layout), 0);
  await write(STORE_KEYS.site, { sites: normalize(pages, capacityOf(setting.layout)), redirectVersion: '', updatedIconVersion: '11.0.41' });
  setStatus('Added to your new tab page');
});

document.getElementById('open-newtab').addEventListener('click', () => {
  // The new tab page is overridden by this extension in both browsers.
  const url = /Firefox\//i.test(navigator.userAgent) ? 'about:newtab' : 'chrome://newtab';
  chrome.tabs.create({ url });
});

function setStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? '#ff8a8a' : '#a8f0a8';
}

prefill();
