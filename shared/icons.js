// Website icon engine. Without access, icons come from Google's icon service through a plain <img>
// (sizes vary by site, often 32 px). With access, icon.horse (256 px for most sites) is tried first,
// then Google, and the pixels are read so the background can be removed (newtab/js/icon-cache.js).
export function siteDomain(target) {
  try {
    return new URL(target).hostname;
  } catch {
    return '';
  }
}

export function siteIconUrl(target, size = 256) {
  const domain = siteDomain(target);
  if (!domain) return '';
  return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`https://${domain}`)}&size=${size}`;
}
