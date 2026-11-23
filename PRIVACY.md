# NewGrid Privacy Policy

Last updated: November 18, 2026

NewGrid is a Chrome, Edge, and Firefox extension that replaces the new tab page with a grid of your favourite websites, plus search, wallpapers, and local backup.

NewGrid has no accounts, no analytics, and no advertising. The developer does not collect, receive, or sell any of your personal data.

## Data stored on your device

Everything you create in NewGrid is stored locally in your browser:

- Your sites, folders, icon settings, layout, search engines are stored in `chrome.storage.local`.
- Wallpaper files you upload (images, GIFs, and videos) are stored in your browser's IndexedDB.
- Backups are only created when you export them. The backup is a file saved to your computer, and it is never uploaded.

This data never leaves your device unless you export a backup yourself.

## Requests NewGrid makes

NewGrid stays local by default. The only network requests it can make are the ones below, and the first of them is off until you turn it on:

- **Website icons (opt-in, off by default):** To display an icon for each site you add, NewGrid can send the site's hostname (for example, `github.com`, not the full address or any page path) to two third-party icon services:
  - `icon.horse`, which returns a higher-quality icon.
  - Google's favicon service (`t0.gstatic.com`), used as a fallback.

  These requests happen only after you enable **Settings → Icons → "Fetch icons from third-party sources"**. When you first turn the setting on, NewGrid asks you to confirm, and the requests start only if you confirm. While the setting is off, no request is made to either service — site icons are instead drawn locally from the site's first letter, so enabling it only ever affects how icons look, never what is saved.

  These services receive the hostname and your IP address, as with any web request. They are governed by their own privacy policies. NewGrid does not send them any other information, and no account identifier is included.
- **Wallpaper links:** If you set a wallpaper to a web link, your browser loads that image or video from the address you entered.
- **Search:** The search bar shows the engine you selected. While that is the built-in default (Google) on the Web tab, pressing Enter sends your query through Chrome's official search API, so results come from whatever provider you set as default in your browser settings. Any other engine — or any category such as Images — opens that engine's website directly with your query, exactly as if you had typed its address yourself. On Firefox, the search always opens the selected engine, and the search is handled by that provider.

## Current tab access

NewGrid requests the `activeTab` permission. It reads the URL and title of the current tab only when you click the "Add this page" button in the toolbar popup. It does not monitor your browsing.

## Permissions

- `storage`: saves your settings and content on this device.
- `unlimitedStorage`: allows large wallpaper files to be stored in IndexedDB (Chromium browsers only; the Firefox build omits it because Firefox has no storage quota to lift).
- `activeTab`: reads the current tab when you use "Add this page".
- `search`: lets the new tab search box submit through your browser's default search provider with the official search API. It grants no access to your browsing data (Chromium only; the Firefox build omits it).

## What NewGrid does not do

- It does not collect personal information, browsing history, or usage analytics.
- It does not sell or share your data for advertising or any other purpose.
- It does not use remote code. All scripts ship inside the extension.

## Children

NewGrid does not knowingly collect information from anyone, including children under 13.

## Changes to this policy

If this policy changes, the updated version will be published in this file, and the "Last updated" date will be changed.

## Contact

Questions about this policy can be sent to: **[your email address]** or opened as an issue at https://github.com/Satanarious/NewGrid/issues.
