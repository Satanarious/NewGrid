export const STORE_KEYS = {
  site: 'store-site',
  setting: 'store-setting',
  search: 'store-search',
  wallpaper: 'store-wallpaper',
};

export const DEFAULT_SETTING = {
  link: { icon: false, search: true },
  view: { pagin: false, scaleMain: 1 },
  layout: { custom: false, row: 3, col: 6, colGap: 24, rowGap: 16, easing: 'linear' },
  icon: { miniMode: false, shadow: false, startAnimation: false, opacity: 0.92, radius: 0.2, scale: 0.7, bgScale: 0.92, isHideIconName: false },
  search: { hide: false, keepSearchInput: false, hideCategory: false, hideButton: true, shadow: true, scale: 1, radius: 0.5, opacity: 1 },
  font: { shadow: true, size: 13, color: 'rgb(221, 221, 221)' },
  wallpaper: { mask: 0, blur: 0 },
  updatetime: 0,
};

export const BUILTIN_ENGINES = [
  {
    uuid: 'google', name: 'Google', desc: 'Google Search',
    types: {
      html: 'https://www.google.com/search?q=%s',
      photos: 'https://www.google.com/search?tbm=isch&q=%s',
      news: 'https://www.google.com/search?tbm=nws&q=%s',
      videos: 'https://www.google.com/search?tbm=vid&q=%s',
      maps: 'https://www.google.com/maps/search/%s',
    },
  },
  {
    uuid: 'bing', name: 'Bing', desc: 'Bing Search',
    types: {
      html: 'https://www.bing.com/search?q=%s',
      photos: 'https://www.bing.com/images/search?q=%s',
      news: 'https://www.bing.com/news/search?q=%s',
      videos: 'https://www.bing.com/videos/search?q=%s',
      maps: 'https://www.bing.com/maps?q=%s',
    },
  },
  {
    uuid: 'duckduckgo', name: 'DuckDuckGo', desc: 'Privacy-focused search',
    types: { html: 'https://duckduckgo.com/?q=%s', photos: 'https://duckduckgo.com/?q=%s&iax=images&ia=images' },
  },
  {
    uuid: 'yahoo', name: 'Yahoo', desc: 'Yahoo Search',
    types: { html: 'https://search.yahoo.com/search?p=%s' },
  },
  {
    uuid: 'baidu', name: 'Baidu', desc: 'Most used in China',
    types: {
      html: 'https://www.baidu.com/s?wd=%s',
      photos: 'https://image.baidu.com/search/index?tn=baiduimage&word=%s',
      news: 'https://news.baidu.com/ns?word=%s',
      videos: 'https://v.baidu.com/v?word=%s',
      maps: 'https://map.baidu.com/search/%s',
    },
  },
  {
    uuid: 'yandex', name: 'Yandex', desc: 'Russian search portal',
    types: { html: 'https://yandex.com/search/?text=%s' },
  },
  {
    uuid: 'sogou', name: 'Sogou', desc: 'Search engine for WeChat public accounts',
    types: { html: 'https://www.sogou.com/web?query=%s' },
  },
  {
    uuid: '360', name: '360 Search', desc: 'Secure search engine',
    types: { html: 'https://www.so.com/s?q=%s' },
  },
];

export const DEFAULT_SEARCH = {
  searchEngine: { custom: [], addList: [], current: 'google' },
  version: 1,
};

export const LOCAL_PAGES = [
  { name: 'Wallpaper', target: 'newgrid://wallpaper', bgText: 'W', bgColor: '#50e3c2' },
  { name: 'Settings', target: 'newgrid://settings', bgText: 'S', bgColor: '#4a4a4a' },
  { name: 'Google', target: 'https://www.google.com/', bgText: 'G', bgColor: '#ffffff' },
];
