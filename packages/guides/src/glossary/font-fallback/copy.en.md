# Font fallback

Font fallback is how a browser draws text when the chosen font is missing, still loading or lacks a character: it moves down the font-family list, then to the device's fonts.

## Definition

- `font-family` lists fonts by preference, and the browser chooses per character: each is drawn with the first available font in the list that has it, so a word can mix two fonts.
- When no listed font has a character, the browser searches the device's installed fonts, and results vary between browsers; when no font has it, a missing-glyph symbol shows instead.
- While a web font loads, `font-display` sets what shows: invisible text during the block period, then a fallback font during the swap period until the web font arrives. If the web font fails, the fallback stays.

## Why it matters

- A fallback font has other letter shapes, widths and line heights, so lines wrap elsewhere and buttons resize, and each device has its own Arabic fonts.
- The generic family at the end of the list is the browser's last resort, and MDN advises always including one, such as `sans-serif`.
- The swap from the fallback to the web font can shift the layout; `size-adjust` in an `@font-face` for the fallback font can bring its size closer to the web font's.

## Example

A web font for Arabic, an installed Arabic font after it, and a generic family last:

```css
@font-face {
  font-family: 'Brand Arabic';
  src: url('/fonts/brand-arabic.woff2') format('woff2');
  font-display: swap;
}
body {
  font-family: 'Brand Arabic', 'Noto Naskh Arabic', system-ui, sans-serif;
}
```

With `swap`, the text shows at once in a fallback, then changes to Brand Arabic when it arrives.

## Common mistakes

- A list with the web font alone, and no generic family at the end.
- A fallback chosen for the Latin design and never tried with Arabic text.
- A web font that fails unnoticed: a wrong path, a font on another domain without an `Access-Control-Allow-Origin` header, or a format the browser cannot read.

## References

- [W3C: CSS Fonts Module Level 4, the font matching algorithm](https://www.w3.org/TR/css-fonts-4/#font-matching-algorithm)
- [MDN: font-family](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-family)
- [MDN: font-display](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/font-display)
- [MDN: size-adjust](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/size-adjust)
