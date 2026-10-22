import { BUILTIN_ENGINES } from './defaults.js';

export const SEARCH_TYPES = ['html', 'photos', 'news', 'videos', 'maps'];

export const SEARCH_TYPE_LABELS = {
  html: 'Web',
  photos: 'Images',
  news: 'News',
  videos: 'Videos',
  maps: 'Maps',
};

export function allEngines(searchState) {
  return [...BUILTIN_ENGINES, ...(searchState.searchEngine.custom || []), ...(searchState.searchEngine.addList || [])];
}

export function findEngine(searchState, uuid) {
  return allEngines(searchState).find((e) => e.uuid === uuid) || BUILTIN_ENGINES[0];
}

// Templates use %s as the placeholder for the query, as the original "Add search engine" help text describes.
export function buildSearchUrl(template, query) {
  return template.replace(/%s/g, encodeURIComponent(query.trim()));
}

export function engineTemplate(engine, type) {
  const types = engine.types || {};
  return types[type] || types.html;
}

export function availableTypes(engine) {
  return SEARCH_TYPES.filter((t) => engine.types && engine.types[t]);
}

export function isValidTemplate(tpl) {
  if (!tpl || !tpl.includes('%s')) return false;
  try {
    new URL(tpl.replace(/%s/g, 'x'));
    return true;
  } catch {
    return false;
  }
}
