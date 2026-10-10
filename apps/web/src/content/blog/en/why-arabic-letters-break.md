---
title: "Why do Arabic letters break apart on your website?"
description: "Arabic letters join, and anything that separates them breaks the word. Five causes we see on real sites: letter-spacing, missing letters, a bad subset, tatweel and encoding, and how to diagnose them."
summary: "Five causes that pull Arabic letters apart on your site, and how to tell which one you have."
date: "2026-10-10"
tags: ["arabic-text", "fonts"]
lang: en
draft: false
reviewed: false
tools: [arabic-shaping-check, letter-spacing-check, arabic-font-check, font-fallback-check, arabic-font-slimmer, tatweel-check]
rules: [ar-letter-spacing, ar-font-no-arabic, ar-font-missing-letters, ar-font-fallback, ar-tatweel, ar-mojibake]
fix: []
terms: [letter-spacing, font-fallback, tatweel, mojibake, web-font-subsetting]
related: [arabic-font-slows-site]
---

You open your site on your computer and it looks right. Then a customer sends a screenshot from their phone, and the heading is in pieces: the letters of a word drawn apart and unjoined, an empty box in the middle of a word, or one letter in a different shape and weight from the rest. These are not random faults. Arabic is a cursive script, and each letter has up to four shapes depending on where it stands in a word. The browser chooses the shape and joins the letters using tables inside the font file. Anything that gets between the browser and those tables breaks the word.

Here are the causes we meet when we scan Arabic websites, from the most common, and how to tell which one you have.

## The first suspect: letter-spacing {#letter-spacing}

It usually comes from a Latin design. A designer wants wide English headings and writes this into the site's template:

```css
h1, h2, .btn {
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

The site is then translated, and the Arabic heading inherits the same property. Here browsers disagree. The CSS standard says a browser that cannot keep the joins between cursive letters must not add the spacing between them. In practice, in our tests Chromium and Firefox left the spacing out of Arabic text, and WebKit, the engine of Safari, drew it. So the page looks right in Chrome and broken on an iPhone, and you only learn it when someone tells you.

The fix is one rule:

```css
:lang(ar) {
  letter-spacing: 0;
}
```

It relies on `lang="ar"` being on the `html` element or on the Arabic element. If you want a wider Arabic heading, raise the size or the weight, not the space between letters. The [letter-spacing checker](/en/tools/letter-spacing-check) measures the longest Arabic word in each element with and without the spacing in the same font; if the width changes, the engine drew it. This is the [ar-letter-spacing rule](/en/rules/ar-letter-spacing).

## The font does not have the letter {#missing-letters}

The browser draws each character with the first font in the `font-family` list that has it. If your site's font is a Latin one, like many chosen for an English brand, it has no Arabic letters at all, and the whole text is drawn in a font from the visitor's device. That font differs from phone to phone, so every visitor sees a different page, and none sees the one you designed. This is the [ar-font-no-arabic](/en/rules/ar-font-no-arabic) case.

The quieter case is an Arabic font that lacks one or two letters. The letters that subset fonts usually drop are «ڤ», «گ», «چ» and «پ», which appear in names and brands, the Arabic-Indic digits `٠١٢٣`, Arabic punctuation, and the diacritics. The browser draws them with a device font, in a different shape, height and weight, in the middle of a word drawn in another font. You may not notice because your own device's font looks like your site's. The [Arabic font checker](/en/tools/arabic-font-check) lists the letters of your page that the font lacks; this is the [ar-font-missing-letters rule](/en/rules/ar-font-missing-letters).

The fix: use the whole font file, add the missing letters when you cut the font, or put a second Arabic font that has them after yours in the list:

```css
body {
  font-family: 'Brand Arabic', 'Noto Naskh Arabic', serif;
}
```

If your font is split with `unicode-range`, make sure one of its parts covers every character your text uses.

## A font that never loaded {#fallback}

Sometimes the font is fine but its file never arrives. A relative path in a CSS file is read from the CSS file's folder, not the page's. A font on another domain may come without an `Access-Control-Allow-Origin` header. Or the format is one the browser cannot read. The device then draws the text in its own font, lines may wrap differently, and buttons change size. The [font fallback checker](/en/tools/font-fallback-check) tells you whether the browser loaded your font; see the [ar-font-fallback rule](/en/rules/ar-font-fallback).

## A subset font that lost its tables {#subset}

Many people cut a font to make it lighter, and that is right. But an Arabic font has tables (GSUB and GPOS) that decide the four shapes, join the letters and make ligatures such as «لا». A cut that drops them breaks the joining, which is worse than the weight you saved. Keep the layout tables:

```sh
pyftsubset font.ttf --unicodes="U+0020-007E,U+0600-06FF,U+200C-200D,U+FB50-FDFF,U+FE70-FEFF" \
  --layout-features='*' --flavor=woff2 --output-file=font-ar.woff2
```

Or use the [Arabic font slimmer](/en/tools/arabic-font-slimmer), which keeps the layout tables and writes the `@font-face` rule with its `unicode-range`. The weight has a longer story in [our article on Arabic fonts and slow sites](/en/blog/arabic-font-slows-site).

## Tatweel and invisible characters {#tatweel}

Tatweel (ـ) stretches a letter so a heading looks wider or a line looks justified. But it is a real character in the text: `العــروض` is not «العروض» to a search engine or to an AI assistant, so someone who types the question the usual way does not find it. Write the word plainly, and if you want the stretch for looks, do it with styling and not with letters. The [tatweel checker](/en/tools/tatweel-check) counts stretched words; this is the [ar-tatweel rule](/en/rules/ar-tatweel).

The same family includes what people paste from PDFs and design tools: invisible characters inside a word, or letters in presentation forms (the ranges U+FB50 to U+FEFF), which look right but are not the original letters.

## A broken encoding {#mojibake}

If strange Latin characters, often starting with Ø and Ù, appear where an Arabic word should be, the fault is not in the letters or the font. The page was written in UTF-8 and the browser read it in another encoding, or the other way round. Put `<meta charset="utf-8">` first in the `head`, before any text, make sure the `Content-Type` header from the server does not say otherwise, and check that the database and its connection use the same encoding. This is the [ar-mojibake rule](/en/rules/ar-mojibake).

## Ten minutes to a diagnosis {#diagnose}

1. Open the page in Safari on an iPhone or in a WebKit engine; it draws what the others do not.
2. Open Chrome's developer tools, then Elements, then Computed, and look at Rendered Fonts: it shows the font the word was really drawn in.
3. If it is not your font, the problem is the font or how it loads.
4. Search your CSS for `letter-spacing` and remove it from Arabic text.
5. Run the [letter joining checker](/en/tools/arabic-shaping-check): it opens your page in Chromium, Firefox and WebKit and checks the spacing and the missing letters together, and shows which engine drew what.

The last check gathers in one place what would take you four separate tries. And if the tools show nothing, ask the customer for a screenshot and find out their font and browser: many faults start with a single device.
