import { STORE_KEYS } from './shared/defaults.js';
import { read, write } from './shared/storage.js';
import { importFirstRunDefaults } from './shared/first-run.js';

const TODO_ALARM_PREFIX = 'todo:';

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') await importFirstRunDefaults();
  const todo = await read(STORE_KEYS.todo, { todoList: [], listLength: 0 });
  await write(STORE_KEYS.todo, todo);
  await restoreTodoAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  restoreTodoAlarms();
});

async function restoreTodoAlarms() {
  const todo = await read(STORE_KEYS.todo, { todoList: [], listLength: 0 });
  const now = Date.now();
  for (const item of todo.todoList) {
    if (item.remindAt && !item.done && item.remindAt > now) {
      chrome.alarms.create(TODO_ALARM_PREFIX + item.id, { when: item.remindAt });
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(TODO_ALARM_PREFIX)) return;
  const id = alarm.name.slice(TODO_ALARM_PREFIX.length);
  const todo = await read(STORE_KEYS.todo, { todoList: [], listLength: 0 });
  const item = todo.todoList.find((t) => t.id === id);
  if (!item || item.done) return;
  chrome.notifications.create(`todo-${id}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'To-do reminder',
    message: item.text || 'You have a to-do item',
    priority: 1,
  });
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('todo-')) {
    chrome.tabs.create({ url: chrome.runtime.getURL('newtab/index.html#todos') });
  }
  chrome.notifications.clear(notificationId);
});
