# Font subsetting

Font subsetting cuts a font file down to the characters a site uses, so it loads faster; an Arabic subset that leaves out letters, digits or marks breaks words.

## Definition

- A subset font keeps only part of the original file's glyphs. Subsetting tools take a list of characters or Unicode ranges and write a smaller file, usually as WOFF2.
- CSS can also split a family into several files, each with its own `unicode-range`; the browser downloads a file only when the page uses a character in its range.
- `unicode-range` only declares what a file is for: the characters drawn are those both in the range and in the file.

## Why it matters

- Arabic text needs more than the basic letters: «ڤ» and «گ» in names and brands, Arabic-Indic digits, punctuation such as `،` and `؟`, and diacritics. A character the subset lacks is drawn mid-word in one of the visitor's fonts, with another shape, weight and height.
- Arabic letters also need the font's shaping data to join: CSS Fonts Level 4 counts a font as supporting a character only when the shaping information its script needs is there. The subsetter of fontTools keeps the features required for shaping by default.

## Example

One family in two files; pages without Arabic text never download the Arabic one:

```css
@font-face {
  font-family: 'Brand';
  src: url('/fonts/brand-arabic.woff2') format('woff2');
  unicode-range: U+0600-06FF;
}
@font-face {
  font-family: 'Brand';
  src: url('/fonts/brand-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF;
}
```

`U+0600-06FF` is Unicode's Arabic block, including the Arabic-Indic digits and the letters of Persian and Urdu. With fontTools:

```
fonttools subset brand-arabic.ttf --unicodes="U+0600-06FF" --flavor=woff2 --output-file=brand-arabic.woff2
```

## Common mistakes

- Cutting a font to the text of one page or a logo, then using it across the site.
- Leaving out Arabic-Indic digits, punctuation, diacritics, or letters of names such as «پ» and «چ».
- Dropping the font's OpenType layout features, which Arabic letters need to join.
- Ignoring the licence: web.dev advises checking that it allows subsetting and self-hosting.

## References

- [web.dev: Best practices for fonts](https://web.dev/articles/font-best-practices)
- [MDN: unicode-range](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/unicode-range)
- [W3C: CSS Fonts Module Level 4, the unicode-range descriptor](https://www.w3.org/TR/css-fonts-4/#unicode-range-desc)
- [fontTools: fonttools subset](https://fonttools.readthedocs.io/en/latest/subset/index.html)
