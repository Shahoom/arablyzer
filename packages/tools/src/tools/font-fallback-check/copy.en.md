---
summary: Did the browser load your font, or draw the text in another one?
---

# Arabic font fallback checker

Renders your page in Chromium, Firefox and WebKit and checks that the web font chosen for Arabic text loaded, rather than failing and leaving the text to a device font.

## What it checks

- Arabic text whose first family in `font-family` is a web font, declared by an `@font-face` rule in the page's CSS or added by a script.
- Whether the files of that font that cover Arabic letters ended in an error, with none of them loaded, such as an address that answers 404, or a font on another domain that does not allow yours.
- What is not counted: files whose `unicode-range` leaves out the Arabic letters, and a file still loading when our wait ended, or never asked for.

## Example

### Wrong

```html
@font-face {
  font-family: 'Brand Arabic';
  src: url('/fonts/brand-arabic.woff2') format('woff2');
  font-display: swap;
}
```

### Right

```html
@font-face {
  font-family: 'Brand Arabic';
  src: url('/_shared/fonts/arablyzer-test-arabic.ttf') format('truetype');
  font-display: swap;
}
```

## How to fix

In the example, the font file was renamed on the server, so its address now answers 404. Find the font's address in the `src` of its `@font-face` rule, open it, and check that it answers with the font file (HTTP 200). The usual causes:

- The file was renamed or moved, or the path is wrong. A relative path in a CSS file is read from the CSS file's own folder, not from the page's.
- The font is on another domain without an `Access-Control-Allow-Origin` header. Browsers load web fonts under the same cross-origin rules as scripts, so that domain must allow yours.
- The format is one the browser cannot read. WOFF2 works in every current browser.

Then give the text a fallback you have checked with Arabic text, after the web font:

```html
<style>
  body {
    font-family: 'Brand Arabic', system-ui, sans-serif;
  }
</style>
```

## FAQ

### Does `font-display: swap` solve it?

No. `font-display` decides what shows while the font loads: with `swap`, the text shows in the fallback font, and the web font takes its place once loaded. When loading fails, the text stays in the fallback font, which is what this tool checks.

### How is this different from the Arabic font checker?

This tool checks a font that did not load at all, so the browser drew the whole text in another font. The Arabic font checker checks a font the browser loaded that lacks characters the text uses.

### Why does the tool sometimes say nothing about a font that did not load?

Because the failure may not be the site's: when Arablyzer's proxy refused a font request, for example for a blocked address, or the page reached Arablyzer's limit on requests or data, which cuts fonts that are still loading, we say nothing for that engine. Nor do we judge a file still loading when our wait ended.

## Methodology

We render the page in Chromium, Firefox and WebKit with Playwright, each behind Arablyzer's egress proxy, and wait a bounded time for web fonts and for the network to go quiet. In each engine we find the elements whose own text has Arabic letters, with the first family in their `font-family`. When that family is one of the page's web fonts, we read the state of its files from the browser's list of fonts (`document.fonts`), and the check fails when a file that covers Arabic letters ended in an error and none of them loaded. We report each font once, at the first element set in it, with the engines where it failed. The same page gives the same result on every check.
