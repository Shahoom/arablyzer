# Letter-spacing on Arabic text

## Messages

### drawn

Arabic text here has `letter-spacing: {letterSpacing}px`, and the browser drew it: gaps open between letters that should join.

### webkit

Arabic text here has `letter-spacing: {letterSpacing}px`. This browser left it out, but WebKit, the engine of Safari, draws it: gaps open between letters that should join.

## Why it matters

- **Arabic letters join each other within a word.** Spacing them apart breaks those joins, so words look broken into pieces and are harder to read. The CSS standard says a browser that cannot keep the joins must not add the spacing between Arabic letters at all.
- **Browsers do not agree.** In our tests, Chromium and Firefox left the spacing out of Arabic text, while WebKit drew it between the letters. WebKit is the engine of Safari, so the same page can look right in Chrome and broken on an iPhone.
- **It usually comes from a Latin design:** a heading style or a button class with `letter-spacing` that also applies to the Arabic version of the page.

## How to fix

Remove `letter-spacing` from Arabic text. When a shared style needs it for Latin text, reset it for Arabic:

```css
:lang(ar) {
  letter-spacing: 0;
}
```

- The reset relies on `lang="ar"` on `<html>` or on the Arabic element; put `lang` there if it is missing.
- To make an Arabic heading look wider, use a wider font weight or size rather than spacing between the letters.

## How we detect

1. We render the page in a browser and find the elements whose own text has Arabic letters.
2. For each one with a `letter-spacing` other than zero, we measure its longest Arabic word with and without that spacing, in the same font. When the width changes, the engine drew the spacing.
3. The rule fails when an engine drew the spacing. When the engines we rendered left it out and WebKit was not one of them, it fails too, because in our tests WebKit drew such spacing. When WebKit rendered the page and left the spacing out, the rule passes.
4. Words of a single letter have no joins, so they do not count.

## References

- [W3C: CSS Text Module Level 3, letter-spacing in cursive scripts](https://www.w3.org/TR/css-text-3/#cursive-tracking)
- [W3C: Arabic & Persian Layout Requirements](https://www.w3.org/TR/alreq/)
