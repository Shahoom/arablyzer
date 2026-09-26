# Web font without Arabic letters

## Messages

### none

The web font "{family}" set for this Arabic text has no Arabic letters, so the browser drew the text in another font.

### partial

The web font "{family}" set for this Arabic text lacks some Arabic letters, so the browser drew those in another font, next to the others.

## Why it matters

- **It is common with Latin fonts:** a site picks one font for its whole design, and that font has Latin letters only. The Arabic text then appears in whatever font the visitor's device has, and looks different from one phone to the next.
- **Two fonts in one word look broken:** when the font has only some of the letters, a single word is drawn in two fonts whose shapes, weights and heights do not match.
- **The page downloads a font that does not draw its main text.**

## How to fix

Use a font that has Arabic letters, or list an Arabic font after the Latin one. For each character, the browser uses the first font in the list that has it:

```css
body {
  font-family: 'Brand Latin', 'Brand Arabic', sans-serif;
}
```

- A font served in parts, one `@font-face` per range of characters, needs a part whose `unicode-range` covers the Arabic letters.
- A font cut down to the letters of a logo or a heading suits that logo or heading only, not text.

## How we detect

1. We render the page in Chromium and find the elements whose own text has Arabic letters and whose first family is one of the page's web fonts.
2. For each such `font-family`, we add a hidden element holding every Arabic letter, set in that `font-family`, and ask Chromium which fonts drew it.
3. The rule fails when none of those fonts is a web font, or when a web font drew some of the letters and a font of the device drew the rest.
4. When the web font did not load at all, that is the finding of the rule for Arabic web fonts that did not load, not of this one.
5. Only Chromium reports the fonts that drew a text, so this rule reads Chromium alone. There is one finding per `font-family`, at the first element set in it.

## References

- [W3C: CSS Fonts Module Level 4, the font matching algorithm](https://www.w3.org/TR/css-fonts-4/#font-matching-algorithm)
- [W3C: CSS Fonts Module Level 4, the unicode-range descriptor](https://www.w3.org/TR/css-fonts-4/#unicode-range-desc)
