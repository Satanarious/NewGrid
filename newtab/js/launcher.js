import { state } from './context.js';
import { isNewGridTarget } from '../../shared/util.js';
import { openPlugin } from './panels.js';
import { openDrawer } from './drawer.js';

export function openTarget(item, event = {}) {
  const target = item.target || '';

  if (target.startsWith('chrome-app://')) {
    const id = target.slice('chrome-app://'.length);
    chrome.management.launchApp(id, () => {
      if (chrome.runtime.lastError) window.alert(chrome.runtime.lastError.message);
    });
    return;
  }

  if (isNewGridTarget(target)) {
    const page = target.slice('newgrid://'.length);
    if (page === 'settings' || page === 'wallpaper') return openDrawer(page);
    return openPlugin(page);
  }

  const newTab = state.setting.link.icon || event.ctrlKey || event.metaKey || event.button === 1;
  if (newTab) chrome.tabs.create({ url: target, active: !event.shiftKey });
  else window.location.href = target;
}
