// Pure model for the icon grid. Layout: pages[] -> items[]; a folder item has children[].
// A position is [page, index] for a top-level item or [page, index, childIndex] for a folder child.

export const capacityOf = (layout) => layout.row * layout.col;

export function newSiteId() {
  return 'siteId-' + crypto.randomUUID();
}

export function newFolderId() {
  return 'folderId-' + crypto.randomUUID();
}

export function newUuid(prefix) {
  return prefix + crypto.randomUUID().replace(/-/g, '');
}

export function findPos(pages, id) {
  for (let p = 0; p < pages.length; p++) {
    for (let i = 0; i < pages[p].length; i++) {
      const item = pages[p][i];
      if (item.id === id) return [p, i];
      if (item.children) {
        for (let c = 0; c < item.children.length; c++) {
          if (item.children[c].id === id) return [p, i, c];
        }
      }
    }
  }
  return null;
}

export function getItem(pages, pos) {
  const [p, i, c] = pos;
  const item = pages[p]?.[i];
  return pos.length === 3 ? item?.children?.[c] : item;
}

export function removeAt(pages, pos) {
  const [p, i, c] = pos;
  if (pos.length === 3) return pages[p][i].children.splice(c, 1)[0];
  return pages[p].splice(i, 1)[0];
}

export function insertAt(pages, pos, item) {
  const [p, i, c] = pos;
  if (p >= pages.length) pages.push([]);
  if (pos.length === 3) {
    pages[p][i].children.splice(c, 0, item);
  } else {
    pages[p].splice(i, 0, item);
  }
}

export function removeById(pages, id) {
  const pos = findPos(pages, id);
  return pos ? removeAt(pages, pos) : null;
}

export function addSite(pages, item, cap, startPage = 0) {
  for (let p = startPage; p < pages.length; p++) {
    if (pages[p].length < cap) {
      pages[p].push(item);
      return p;
    }
  }
  pages.push([item]);
  return pages.length - 1;
}

// Drop `draggedId` in front of `targetId`. When targetId is null, append to `page`.
export function moveBefore(pages, draggedId, targetId, page = 0) {
  const dragged = removeById(pages, draggedId);
  if (!dragged) return null;
  if (targetId == null) {
    if (page >= pages.length) pages.push([]);
    pages[page].push(dragged);
    return dragged;
  }
  const pos = findPos(pages, targetId);
  if (!pos) {
    pages[page].push(dragged);
    return dragged;
  }
  insertAt(pages, pos, dragged);
  return dragged;
}

// Put `draggedId` inside the top-level folder `folderId`.
export function moveIntoFolder(pages, draggedId, folderId, now = Date.now()) {
  const folderPos = findPos(pages, folderId);
  if (!folderPos || folderPos.length !== 2) return false;
  const dragged = removeById(pages, draggedId);
  if (!dragged) return false;
  const folder = getItem(pages, findPos(pages, folderId));
  folder.children.push(dragged);
  folder.updatetime = now;
  return true;
}

// Merge `draggedId` onto top-level `targetId`, creating a folder that holds both.
export function mergeIntoFolder(pages, targetId, draggedId, name, now = Date.now()) {
  if (targetId === draggedId || !findPos(pages, draggedId)) return null;
  const targetPos = findPos(pages, targetId);
  if (!targetPos || targetPos.length !== 2) return null;
  if (getItem(pages, targetPos).children) return moveIntoFolder(pages, draggedId, targetId, now) ? targetId : null;
  const dragged = removeById(pages, draggedId);
  const pos = findPos(pages, targetId);
  const target = getItem(pages, pos);
  const folder = {
    id: newFolderId(),
    uuid: newUuid('folder-'),
    name,
    children: [target, dragged],
    updatetime: now,
  };
  pages[pos[0]][pos[1]] = folder;
  return folder.id;
}

// Unwrap a folder: its first child takes the folder's slot, the rest follow it.
export function destroyFolder(pages, folderId) {
  const pos = findPos(pages, folderId);
  if (!pos || pos.length !== 2) return false;
  const [p, i] = pos;
  const folder = pages[p][i];
  const kids = folder.children || [];
  if (!kids.length) {
    pages[p].splice(i, 1);
    return true;
  }
  pages[p][i] = kids[0];
  if (kids.length > 1) pages[p].splice(i + 1, 0, ...kids.slice(1));
  return true;
}

// Remove a folder and everything in it.
export function deleteFolder(pages, folderId) {
  const pos = findPos(pages, folderId);
  if (!pos || pos.length !== 2) return false;
  pages[pos[0]].splice(pos[1], 1);
  return true;
}

export function renameFolder(pages, folderId, name, now = Date.now()) {
  const pos = findPos(pages, folderId);
  if (!pos) return false;
  const item = getItem(pages, pos);
  item.name = name;
  item.updatetime = now;
  return true;
}

// Make the grid consistent after edits: unwrap 1-child folders, drop empty folders,
// split pages that exceed capacity into following pages, drop empty pages.
export function normalize(pages, cap) {
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      const item = page[i];
      if (item.children) {
        if (item.children.length === 0) {
          page.splice(i, 1);
          i -= 1;
        } else if (item.children.length === 1) {
          page[i] = item.children[0];
        }
      }
    }
  }
  for (let p = 0; p < pages.length; p++) {
    if (pages[p].length > cap) {
      const extra = pages[p].splice(cap);
      if (p + 1 < pages.length) pages[p + 1].unshift(...extra);
      else pages.push(extra);
    }
  }
  for (let p = pages.length - 1; p >= 0; p--) {
    if (!pages[p].length) pages.splice(p, 1);
  }
  if (!pages.length) pages.push([]);
  return pages;
}

export function findIconById(pages, id) {
  const pos = findPos(pages, id);
  return pos ? getItem(pages, pos) : null;
}

export function allSites(pages) {
  const out = [];
  for (const page of pages) {
    for (const item of page) {
      if (item.children) out.push(...item.children);
      else out.push(item);
    }
  }
  return out;
}

export function defaultSite(overrides = {}) {
  return {
    id: newSiteId(),
    uuid: newUuid('site-'),
    name: '',
    target: '',
    type: 'web',
    bgType: 'color',
    bgColor: '#ffffff',
    bgText: '',
    updatetime: Date.now(),
    ...overrides,
  };
}
