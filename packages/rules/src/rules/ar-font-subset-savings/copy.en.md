# Arabic font carries much more than the page shows

## Messages

### oversized

The font «{family}» ({file}) is {size}, and a subset of the letters this page's Arabic text uses would be {subset}: {saved} less ({percent}%), with joining and shaping kept.

## Why it matters

- A font file is downloaded before the text it draws can be shown in it. An Arabic font with every letter form, every diacritic and extra scripts can weigh more than the rest of a page, and visitors on a mobile connection wait for it.
- Most pages use a few dozen letters and a handful of digits and marks. The rest of the file is dead weight on every visit.
- A subset made for Arabic keeps the font's shaping tables (GSUB and GPOS), so letters still join and ligatures such as «لا» still form. A subset that drops them breaks the joining, which is worse than the weight.

## How to fix

- Cut the file to the characters your text uses, with the tool on this page, which makes a WOFF2 file and the `@font-face` rule with its `unicode-range`. Characters outside the range fall back to the next font in your list, so a subset is safe to ship.
- Or use `pyftsubset` from fontTools yourself, keeping the layout tables:

```sh
pyftsubset font.ttf --unicodes="U+0020-007E,U+0600-06FF,U+200C-200D,U+FB50-FDFF,U+FE70-FEFF" \
  --layout-features='*' --flavor=woff2 --output-file=font-ar.woff2
```

- Serve it as WOFF2, and add `font-display: swap`.

## How we detect

1. We render the page and read the font files it loaded.
2. For each file that draws Arabic letters, we take the characters of the Arabic text set in its family and make the subset HarfBuzz would make for them, plus the digits of both scripts, punctuation, the joiners and the presentation forms of the letters used.
3. The rule fails when the subset is more than half smaller than the file and more than 50 KB smaller.
4. The size of a file is what the browser received, after any gzip. A page's text beyond the first 200 Arabic elements is not read, so a page showing more letters may need a few more than the subset has; the `unicode-range` makes that harmless.

## References

- [Google: Best practices for fonts](https://web.dev/articles/font-best-practices)
- [fontTools: pyftsubset](https://fonttools.readthedocs.io/en/latest/subset/index.html)
- [W3C: CSS Fonts Module Level 4, the unicode-range descriptor](https://www.w3.org/TR/css-fonts-4/#unicode-range-desc)
