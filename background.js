import { importFirstRunDefaults } from './shared/first-run.js';

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') await importFirstRunDefaults();
});
