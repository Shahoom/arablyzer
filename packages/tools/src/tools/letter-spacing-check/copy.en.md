---
summary: Does letter-spacing open gaps between letters that should join?
---

# Arabic letter-spacing checker

Renders your page in Chromium, Firefox and WebKit and checks that letter-spacing opens no gaps between Arabic letters, so words stay joined in Safari as in Chrome.

## What it checks

- Elements whose own text has Arabic letters and whose `letter-spacing` is above zero, whichever CSS rule set it.
- Whether each engine drew that spacing between the letters: in our tests WebKit, the engine of Safari, drew it, and Chromium and Firefox left it out.
- What does not split letters is not counted: words of a single letter, and negative spacing, which draws the letters closer so they overlap a little but stay joined.

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

Remove `letter-spacing` from Arabic text. When a shared style needs it for Latin text, reset it for Arabic, so it stays on the Latin text alone:

```html
<style>
  .title {
    letter-spacing: 0.1em;
  }
  :lang(ar) {
    letter-spacing: 0;
  }
</style>
<h1 class="title">عروض الأسبوع</h1>
<p class="title" lang="en" dir="ltr">WEEKLY DEALS</p>
```

- This relies on `lang="ar"` on `<html>` or on the Arabic element itself, and `lang="en"` on the English one; add them if they are missing.
- Put the `:lang(ar)` rule after your styles: its specificity is that of a class such as `.title`, so the later of the two wins. A more specific selector, such as `.hero h1`, needs a rule more specific still: `.hero h1:lang(ar)`.
- To make an Arabic heading look wider, use a bolder weight or a larger size rather than spacing between the letters.

## FAQ

### Can I use `letter-spacing` with Arabic text?

No. Arabic letters join each other within a word, and spacing them apart breaks those joins, so words look broken into pieces and are harder to read. The CSS standard says a browser that cannot keep the joins must not add the spacing between Arabic letters at all, and browsers do not agree on it.

### My page looks right in Chrome. Why does it fail?

Because browsers do not agree: in our tests Chromium and Firefox left the spacing out of Arabic text, while WebKit, the engine of Safari, drew it between the letters, so the same page can look right in Chrome and broken on an iPhone. The check therefore fails when any engine drew the spacing, or when WebKit did not render the page; it passes when WebKit rendered it and left the spacing out.

### Can I stretch words with tatweel «ـ» instead?

No. Tatweel is a character of its own in the text, so someone searching for «العروض» may not find «`الـعـروض`», and copying and pasting carries it along with the word. To make headings stand out, use the font, its weight and its size.

## Methodology

We render the page in Chromium, Firefox and WebKit with Playwright, each behind Arablyzer's egress proxy. In each engine we find the elements whose own text has Arabic letters, and for each one with a `letter-spacing` above zero we measure its longest Arabic word with and without that spacing, in the same font. When the width changes, the engine drew the spacing, and the check fails. When the engines that rendered the page left the spacing out and WebKit was not one of them, it fails too, because WebKit drew such spacing in our tests; when WebKit rendered the page and left the spacing out, it passes. We report each element once, with the engines that drew the spacing in it. The same page gives the same result on every check.
