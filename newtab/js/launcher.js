import { state } from './context.js';
import { isNewGridTarget, toast } from '../../shared/util.js';
import { openDrawer } from './drawer.js';

export function openTarget(item, event = {}) {
  const target = item.target || '';

  if (target.startsWith('chrome-app://')) {
    const id = target.slice('chrome-app://'.length);
    // Chromium's management API, reached by name: Firefox has no equivalent, and there the
    // launch falls back to a message. (Chrome-app targets can only be created on Chromium.)
    const management = chrome['management'];
    if (management?.launchApp) {
      management.launchApp(id, () => {
        if (chrome.runtime.lastError) window.alert(chrome.runtime.lastError.message);
      });
    } else {
      toast('This browser cannot launch Chrome apps');
    }
    return;
  }

  if (isNewGridTarget(target)) {
    const page = target.slice('newgrid://'.length);
    if (page === 'settings' || page === 'wallpaper') return openDrawer(page);
    return toast('Coming soon');
  }

  const newTab = state.setting.link.icon || event.ctrlKey || event.metaKey || event.button === 1;
  if (newTab) chrome.tabs.create({ url: target, active: !event.shiftKey });
  else window.location.href = target;
}
