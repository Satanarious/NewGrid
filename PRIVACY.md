# NewGrid Privacy Policy

Last updated: October 22, 2026

NewGrid is a Chrome and Edge extension that replaces the new tab page with a grid of your favourite websites, plus search, wallpapers, to-do reminders, and local backup.

NewGrid has no accounts, no analytics, and no advertising. The developer does not collect, receive, or sell any of your personal data.

## Data stored on your device

Everything you create in NewGrid is stored locally in your browser:

- Your sites, folders, icon settings, layout, search engines, notes, and to-dos are stored in `chrome.storage.local`.
- Wallpaper files you upload (images, GIFs, and videos) are stored in your browser's IndexedDB.
- Backups are only created when you export them. The backup is a file saved to your computer, and it is never uploaded.

This data never leaves your device unless you export a backup yourself.

## Requests NewGrid makes

NewGrid makes a small number of network requests to show icons and wallpapers:

- **Website icons:** To display an icon for each site you add, NewGrid sends the site's hostname (for example, `github.com`, not the full address or any page path) to two third-party icon services:
  - `icon.horse`, which returns a higher-quality icon.
  - Google's favicon service (`t0.gstatic.com`), used as a fallback.

  These services receive the hostname and your IP address, as with any web request. They are governed by their own privacy policies. NewGrid does not send them any other information, and no account identifier is included.
- **Wallpaper links:** If you set a wallpaper to a web link, your browser loads that image or video from the address you entered.
- **Search:** When you search, your browser opens the search engine you selected, and the search is handled by that provider.

## Current tab access

NewGrid requests the `activeTab` permission. It reads the URL and title of the current tab only when you click the "Add this page" button in the toolbar popup. It does not monitor your browsing.

## Reminders

To-do reminders use Chrome's `alarms` and `notifications` features. These run locally, and nothing is sent anywhere.

## Permissions

- `storage`: saves your settings and content on this device.
- `unlimitedStorage`: allows large wallpaper files to be stored in IndexedDB.
- `alarms`: schedules to-do reminders.
- `notifications`: shows to-do reminders.
- `activeTab`: reads the current tab when you use "Add this page".

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
