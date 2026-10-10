---
title: "Your Arabic font is slowing your site"
description: "An Arabic font file can outweigh the rest of the page, and the text waits for it. How to measure the extra weight, cut the font safely, choose weights, preload it and stop the page jumping."
summary: "How to cut an Arabic font to the letters you use without breaking the joins."
date: "2026-10-10"
tags: ["fonts", "performance"]
lang: en
draft: false
reviewed: false
tools: [arabic-font-slimmer, arabic-font-check, font-fallback-check, core-web-vitals]
rules: [ar-font-subset-savings, ar-font-fallback, ar-font-missing-letters, cwv-cls-poor]
fix: []
terms: [web-font-subsetting, font-fallback, cls]
related: [why-arabic-letters-break]
---

A beautiful Arabic font is heavy. It holds the shapes of every letter in its four positions, the diacritics, letters for several languages written in Arabic script, and sometimes Latin letters too. One file can weigh more than the rest of the page, and your visitor, on a phone with an average connection, waits for it before seeing a single word in your font. That price can be cut a long way without changing the font.

## Why the weight matters {#why}

A browser does not draw text in a web font until it has loaded that font's file. So the text either waits, invisible, or appears in the device's font and then switches when yours arrives, and the page moves. Either way, what the visitor sees comes later or changes place. Those are the two metrics LCP and CLS in Core Web Vitals.

Most pages use a few dozen letters and a handful of digits and marks. The rest of the file is dead weight that every visitor downloads on every visit. Hence the idea: cut the font to what your pages need.

## How we measure the extra {#measure}

The [Arabic font slimmer](/en/tools/arabic-font-slimmer) reads the font your page loaded and makes the subset HarfBuzz would make for the letters the page really uses, plus the digits of both scripts, punctuation, the joiners and the presentation forms of the letters used, then compares the two sizes. The [ar-font-subset-savings rule](/en/rules/ar-font-subset-savings) fails when the subset is more than half smaller **and** more than 50 KB smaller. The double condition is deliberate: a font that is small already does not deserve the effort even if you halve it.

The size is what the browser received, after gzip if the server compresses. And we read the first two hundred Arabic elements of the page: a page with more text may need a few more letters than we cut, which does no harm, as we will see.

## A correct cut keeps the joining tables {#subset}

A cut that drops the layout tables (GSUB and GPOS) breaks the joining of letters and ligatures such as «لا», which is worse than the weight you saved. Use a cut that keeps them:

```sh
pyftsubset font.ttf \
  --unicodes="U+0020-007E,U+0600-06FF,U+200C-200D,U+FB50-FDFF,U+FE70-FEFF" \
  --layout-features='*' --flavor=woff2 --output-file=font-ar.woff2
```

Or let the tool do it and write the `@font-face` rule for you:

```css
@font-face {
  font-family: 'Brand Arabic';
  src: url('/fonts/brand-arabic.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
  unicode-range: U+0600-06FF, U+200C-200D, U+0020-007E;
}
```

Characters outside the `unicode-range` fall to the next font in the list, so cutting is safe even if someone adds a new character later. But take care that a letter you need is not left out of the font with no second font to cover it, or it will appear in a stranger's font. The [font checker](/en/tools/arabic-font-check) warns you of this, and we explained it in [the article on broken letters](/en/blog/why-arabic-letters-break).

## Fewer weights {#weights}

Every weight is a separate file. A site that asks for regular, bold, medium and italic loads four files before it draws its heading. Two weights, regular and bold, are usually enough. On this site no page asks for more than weights 400 and 600, because any third weight is one more file fetched before the first paint. We measured it ourselves: one extra weight in the interface cost three points in Lighthouse on a phone.

A variable font is one file for all weights, and it may be bigger than two static ones. Measure before you adopt it: neither style always wins.

## Load it early and do not block the text {#loading}

- **`font-display: swap`:** the browser shows the text in a fallback font at once and swaps later. Do not leave the text invisible while it waits.
- **`preload` for the most important file:** the download starts before CSS discovers it. `crossorigin` is required even for a font from your own domain:

```html
<link rel="preload" href="/fonts/brand-arabic.woff2" as="font" type="font/woff2" crossorigin>
```

- **WOFF2 alone:** every current browser reads it, so no other formats are needed.
- **A font from your own domain:** an outside font service adds a connection to another domain before the first byte. If you choose one, know that services such as Google Fonts already split the font by `unicode-range`, so what you pay is the extra connection, not the weight.
- **Do not ship what you do not show:** icon fonts of which three icons appear, or weights used by one page, are better loaded on demand.

## Stopping the jump at the swap {#shift}

CLS happens when the fallback font differs from yours in line height and letter width, so lines move when your font arrives. You can bring the fallback close to your font with properties in the fallback's `@font-face`, such as `size-adjust`, `ascent-override` and `descent-override`, so sizes change a little instead of lines moving. Try them on your own devices and measure CLS before you roll them out: the result depends on the font.

And if the font never arrives, for a wrong path or a missing CORS header, the device draws the text in its own font every time, and the [ar-font-fallback rule](/en/rules/ar-font-fallback) records it; the [font fallback checker](/en/tools/font-fallback-check) tests whether it arrives.

## Steps in order {#steps}

1. Run the [slimmer](/en/tools/arabic-font-slimmer) on your page with the most text and read the current weight and the cut weight.
2. If the difference is large, cut the font and save it as WOFF2 with a `unicode-range`.
3. Reduce the weights to those you really use.
4. Add `font-display: swap` and a `preload` for the main file.
5. Open the page on a phone with an average connection and see whether the first line moves when the font arrives.
6. Weeks later, check field CLS and LCP in the [Core Web Vitals checker](/en/tools/core-web-vitals): its window is 28 days.

The font is part of your site's identity and should not be sacrificed for speed. Cutting it does not change what the visitor sees. It changes when they see it.
