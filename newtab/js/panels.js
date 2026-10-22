import { state, saveNotes, saveTodo } from './context.js';
import { esc, $, toast, formatTime } from '../../shared/util.js';
import { confirmDialog } from './confirm.js';

const TITLES = {
  notes: 'Notes',
  todos: 'To-dos',
};

const plugin = { name: null };

export function openPlugin(name) {
  if (!TITLES[name]) return toast('Coming soon');
  plugin.name = name;
  const overlay = $('#overlay-plugin');
  overlay.querySelector('.plugin-title').textContent = TITLES[name];
  overlay.dataset.kind = name;
  overlay.classList.remove('hide');
  renderPlugin();
}

export function closePlugin() {
  plugin.name = null;
  $('#overlay-plugin').classList.add('hide');
}

export function isPluginOpen() {
  return plugin.name != null;
}

export function renderPlugin() {
  if (!plugin.name) return;
  const body = $('#overlay-plugin .plugin-body');
  body.innerHTML = '';
  RENDERERS[plugin.name](body);
}

// ---- notes ---------------------------------------------------------------

function renderNotes(body) {
  const notes = state.notes;
  const current = notes.list.find((n) => n.id === notes.checkedId) || notes.list[0] || null;
  body.innerHTML = `
    <div class="split">
      <aside class="list">
        <button id="note-new">+ New note</button>
        ${notes.list.length ? notes.list.map((n) => `
          <div class="list-item${current && n.id === current.id ? ' active' : ''}" data-note="${esc(n.id)}">
            <strong>${esc(n.title || 'No title')}</strong><small>${esc(formatTime(n.updatetime))}</small>
          </div>`).join('') : '<p class="empty">Take your first note</p>'}
      </aside>
      <section class="editor-pane">
        ${current ? `
          <input id="note-title" value="${esc(current.title)}" placeholder="No title">
          <textarea id="note-body" placeholder="Write something...">${esc(current.content)}</textarea>
          <div class="row"><small>${esc(formatTime(current.updatetime))}</small><button id="note-delete" class="danger">Delete</button></div>`
          : '<p class="empty">No note selected</p>'}
      </section>
    </div>`;

  body.querySelector('#note-new').addEventListener('click', async () => {
    const title = window.prompt('Please enter a note title');
    if (title === null) return;
    const note = { id: 'note-' + crypto.randomUUID(), title: title.trim() || 'No title', content: '', updatetime: Date.now() };
    await saveNotes({ list: [note, ...state.notes.list], checkedId: note.id });
    renderPlugin();
  });
  body.querySelectorAll('[data-note]').forEach((el) => {
    el.addEventListener('click', async () => {
      await saveNotes({ ...state.notes, checkedId: el.dataset.note });
      renderPlugin();
    });
  });
  if (!current) return;

  const save = async () => {
    const latest = state.notes;
    const list = latest.list.map((n) => (n.id === current.id
      ? { ...n, title: body.querySelector('#note-title').value.trim() || 'No title', content: body.querySelector('#note-body').value, updatetime: Date.now() }
      : n));
    await saveNotes({ ...latest, list, checkedId: current.id });
  };
  body.querySelector('#note-title').addEventListener('change', save);
  body.querySelector('#note-body').addEventListener('input', debounce(save, 400));
  body.querySelector('#note-delete').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Delete note', message: 'Confirm note deletion?', okText: 'Delete', danger: true });
    if (!ok) return;
    await saveNotes({ list: state.notes.list.filter((n) => n.id !== current.id), checkedId: null });
    renderPlugin();
  });
}

function debounce(fn, ms) {
  let t;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

// ---- to-dos --------------------------------------------------------------

function renderTodos(body) {
  const list = state.todo.todoList;
  body.innerHTML = `
    <div class="stack">
      <input id="todo-input" placeholder="Enter text and press Enter to add">
      <ul class="todo-list">${list.length ? list.map((t) => `
        <li class="${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
          <input type="checkbox" class="todo-done" ${t.done ? 'checked' : ''}>
          <span class="todo-text">${esc(t.text)}</span>
          <input type="datetime-local" class="todo-remind" value="${t.remindAt ? toLocalInput(t.remindAt) : ''}" title="Set the reminder time">
          <button class="link danger todo-del">×</button>
        </li>`).join('') : '<li class="empty">No To-do Items</li>'}
      </ul>
      <div><button id="todo-clear">Remove completed to-do items</button></div>
    </div>`;

  body.querySelector('#todo-input').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    const item = { id: 'todo-' + crypto.randomUUID(), text: e.target.value.trim(), done: false, createdAt: Date.now() };
    e.target.value = '';
    const todoList = [item, ...state.todo.todoList];
    await saveTodo({ todoList, listLength: todoList.filter((t) => !t.done).length });
    renderPlugin();
  });
  body.querySelectorAll('.todo-list li[data-id]').forEach((li) => {
    const id = li.dataset.id;
    li.querySelector('.todo-done').addEventListener('change', (e) => updateTodo(id, { done: e.target.checked }));
    li.querySelector('.todo-remind').addEventListener('change', (e) => {
      const when = e.target.value ? new Date(e.target.value).getTime() : null;
      const future = when && when > Date.now() ? when : null;
      if (future) chrome.alarms.create(`todo:${id}`, { when: future });
      else chrome.alarms.clear(`todo:${id}`);
      updateTodo(id, { remindAt: future });
    });
    li.querySelector('.todo-text').addEventListener('dblclick', (e) => {
      const next = window.prompt('Edit content', e.target.textContent);
      if (next && next.trim()) updateTodo(id, { text: next.trim() });
    });
    li.querySelector('.todo-del').addEventListener('click', async () => {
      chrome.alarms.clear(`todo:${id}`);
      const todoList = state.todo.todoList.filter((t) => t.id !== id);
      await saveTodo({ todoList, listLength: todoList.filter((t) => !t.done).length });
      renderPlugin();
    });
  });
  body.querySelector('#todo-clear').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Remove completed', message: 'Delete all completed to-do items?', okText: 'Delete', danger: true });
    if (!ok) return;
    const keep = state.todo.todoList.filter((t) => !t.done);
    state.todo.todoList.filter((t) => t.done).forEach((t) => chrome.alarms.clear(`todo:${t.id}`));
    await saveTodo({ todoList: keep, listLength: keep.length });
    renderPlugin();
  });
}

async function updateTodo(id, patch) {
  const todoList = state.todo.todoList.map((t) => (t.id === id ? { ...t, ...patch } : t));
  await saveTodo({ todoList, listLength: todoList.filter((t) => !t.done).length });
  renderPlugin();
}

function toLocalInput(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const RENDERERS = {
  notes: renderNotes,
  todos: renderTodos,
};

export function bindPlugins() {
  $('#overlay-plugin .close').addEventListener('click', closePlugin);
}
