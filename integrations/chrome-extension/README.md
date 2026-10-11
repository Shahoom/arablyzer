# Arablyzer for Chrome

A Manifest V3 extension: open a page, press **افحص هذه الصفحة** (Check this page), and see the page's score and its
worst problems, each linked to the rule's page, without leaving the browser. The score also shows on the toolbar icon
(its badge) for that tab. It calls the [public API](https://arablyzer.com/developers) with your key, so a scan comes
out of your account's own quota (the same page again within ten minutes uses none).

Without a key the popup offers to open the site's own scan page with the address filled in.

## Try it

```
pnpm ext:build
```

writes `integrations/chrome-extension/dist/` and `arablyzer-chrome-extension-<version>.zip` next to it. In Chrome:
`chrome://extensions` → Developer mode → **Load unpacked** → choose `dist/`. Open the options page, paste a key
(Account → API keys on the site), and press **Test the key**.

## What it asks for, and why

- `activeTab`: to read the address of the tab you press the button on, at that moment and no other.
- `storage`: the key, the service address and the language, in `chrome.storage.sync` (so they follow your Chrome
  account; the key is stored there as you asked, not in a file).
- Host permission for `https://arablyzer.com/*` only: the API sends no CORS headers, so the extension needs the
  permission to read its answers. Another service address (your own server) is asked for at runtime, one address at a
  time, from the options page; `optional_host_permissions` lists what it may ask for and grants nothing at install.
- No background worker, no content script, no `tabs`, `cookies`, `history` or `webRequest`.
- No analytics, no remote code (MV3 forbids it, and the page's CSP is `script-src 'self'`); the popup builds its
  elements with text only, never `innerHTML`, so nothing a scanned page says can become markup.

## Layout

`src/controller.ts` is the popup's logic (scan, wait, resume, badge) and `src/options-flow.ts` the options page's;
both take `chrome` as an argument and are tested with a stand-in. `src/popup.ts` and `src/options.ts` only draw, and
are the two places the global `chrome` and `fetch` are used. `scripts/build.ts` bundles with esbuild, copies
`static/`, draws the icons from the site's mark (`scripts/icons.ts`, no image is kept in git), writes the store
listing's name and description per language (from `packages/i18n/src/integrations.ts`) and zips (`scripts/zip.ts`).
`test/build.test.ts` checks the store's usual questions on the built output: the permissions, the CSP, no inline code,
no remote file.

## Publishing (the owner's)

The Chrome Web Store needs a developer account (a one-time US$5 fee) and a listing: upload the zip, add screenshots,
a privacy policy address, and the single-purpose and permission justifications above. Nothing is submitted from CI.
