---
summary: Does your font have every letter your text uses?
---

# Arabic font checker

Renders your page and checks that the web font you chose for Arabic text has the Arabic letters and every character your text uses, so none is drawn in another font.

## What it checks

- The web font you chose for Arabic text has Arabic letters, not Latin letters only, which would leave the browser to draw the whole text in another font.
- It has all the Arabic letters, so no single word is drawn in two fonts whose shapes, weights and heights do not match.
- The other characters the text uses, such as «ڤ», «پ», the Arabic-Indic digits, Arabic punctuation and diacritics: whether that font, or a web font after it in the list, has them.

## Example

### Wrong

```html
body {
  margin: 16px;
  font-family: 'Brand Latin', sans-serif;
}
```

### Right

```html
body {
  margin: 16px;
  font-family: 'Brand Latin', 'Brand Arabic', sans-serif;
}
```

## How to fix

Use a font that has Arabic letters, or list an Arabic font after the Latin one. For each character, the browser uses the first font in the list that has it, so the Latin font draws the Latin letters and the Arabic font the Arabic ones:

```html
<style>
  body {
    font-family: 'Brand Latin', 'Brand Arabic', sans-serif;
  }
</style>
```

- When you subset the font, add everything your text uses to the list of characters the subsetting tool takes: «ڤ», «گ», «چ» and «پ», the Arabic-Indic digits, Arabic punctuation, and diacritics.
- A font split into parts with `unicode-range` needs a part that covers every character the text uses.
- A font cut down to the letters of a logo or a heading suits that logo or heading only, not text.

## FAQ

### Why does my font show in English text but not in Arabic?

Because the font has Latin letters only. It is common when a site picks one font for its whole design: the Arabic text is then drawn in whatever font the visitor's device has, and looks different from one phone to the next. List an Arabic font after it in `font-family`.

### My font is Arabic. Why does it lack some characters?

It may be a subset: a file that holds only part of the font's characters, to be smaller. Subsetting tools take a list of characters, and what is not on the list is left out of the file. Often left out: «ڤ», «گ», «چ» and «پ», which come up in names and brands, the Arabic-Indic digits, Arabic punctuation, and diacritics.

### How is this different from the Arabic font fallback checker?

This tool checks a font the browser loaded that lacks characters the text uses. The Arabic font fallback checker checks a font that did not load at all, so the browser drew the whole text in another font.

## Methodology

We render the page in Chromium, Firefox and WebKit with Playwright, each behind Arablyzer's egress proxy. For each `font-family` whose first family is one of the page's web fonts, we add a hidden element holding every Arabic letter, set in that `font-family`, and ask Chromium which fonts drew it; only Chromium reports that, so we read this part from Chromium alone. Then, in each engine, we read the font files the browser loaded and the stylesheets that tie each font to its files and their `unicode-range`, to know which characters each font has, and go down each element's `font-family` list as the browser does to find the font that draws each character. We do not judge a character whose font file we did not read, such as a file still loading, or one whose size we could not know before reading it. We report each font once, with every character it lacks on the page. The same page gives the same result on every check.
