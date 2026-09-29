---
summary: Do Arabic letters join in Chromium, Firefox and WebKit?
---

# Arabic letter joining checker

Renders your page in Chromium, Firefox and WebKit and finds what splits Arabic letters or changes their shape mid-word: letter-spacing, and letters your font lacks.

## What it checks

- Arabic text with a `letter-spacing` above zero, and whether Chromium, Firefox or WebKit drew it, opening gaps between letters that should join.
- Each engine on its own, because they disagree: in our tests WebKit, the engine of Safari, drew the spacing in Arabic text, while Chromium and Firefox left it out.
- Characters the Arabic text uses that neither the web font drawing it nor a web font after it in the list has, such as «ڤ», «گ» and the Arabic-Indic digits, so the browser draws them in a device font in the middle of the word.

## Example

### Wrong

```html
.title {
  letter-spacing: 0.1em;
}
```

### Right

```html
:lang(ar) {
  letter-spacing: 0;
}
```

## How to fix

Remove `letter-spacing` from Arabic text. When a shared style needs it for Latin text, reset it for Arabic:

```html
<style>
  :lang(ar) {
    letter-spacing: 0;
  }
</style>
```

For the characters your font lacks, use the whole font file, add them to the subset you make from it, or put a similar font that has them after it in `font-family`:

```html
<style>
  body {
    font-family: 'Brand Arabic', 'Noto Naskh Arabic', serif;
  }
</style>
```

- `:lang(ar)` relies on `lang="ar"` on `<html>` or on the Arabic element itself; add it if it is missing.
- To make an Arabic heading look wider, use a bolder weight or a larger size rather than spacing between the letters.

## FAQ

### Why do letters join in Chrome but split in Safari?

`letter-spacing` is one cause: in our tests Chromium and Firefox left that spacing out of Arabic text, while WebKit, the engine of Safari, drew it between the letters. That is why we render the page in all three engines rather than judge it by what Chrome shows.

### Why does one letter show in a different font in the middle of a word?

Because the site's font does not have it. The browser draws each character with the first font in the list that has it, so a character the site's font lacks is drawn with one of the visitor's own fonts, in a different shape, weight and height. It happens most with characters that subset fonts leave out, such as «ڤ», «گ», «چ» and «پ», the Arabic-Indic digits, Arabic punctuation, and diacritics.

### Does the tool catch everything that splits Arabic letters?

No. It measures two causes in the rendered page: spacing between the letters, and characters the web font lacks. It does not judge screenshots of the page, so a letter split for another reason is not reported by this tool.

## Methodology

We render the page in Chromium, Firefox and WebKit with Playwright, each behind Arablyzer's egress proxy, and measure it as each engine drew it, after its JavaScript has run. For each element whose own text has Arabic letters and a `letter-spacing` above zero, we measure its longest Arabic word with and without the spacing, in the same font: when the width changes, the engine drew the spacing. When the engines that rendered the page left the spacing out and WebKit was not one of them, it counts too, because WebKit drew it in our tests. We also read the font files and stylesheets the browser loaded to know which characters each font has, then go down each element's `font-family` list as the browser does; a character whose font file we did not read is not judged. The same page gives the same result on every check.
