---
summary: How much of your Arabic font does the page use? Get a smaller WOFF2 made for your text.
---

# Arabic font slimmer

Renders your page, finds its Arabic web fonts and the Arabic text it shows, and tells you how many bytes each font file weighs against a subset holding only the letters in use. Then you can download that subset as WOFF2, with a ready `@font-face` rule and `unicode-range`.

## What it checks

- Each Arabic web font the page loaded: its file size, against the size of a subset made for the characters the page's Arabic text uses.
- The subset keeps what Arabic needs: the digits of both scripts, punctuation, the joiners (ZWJ and ZWNJ), the presentation forms of the letters used, and the font's shaping tables (GSUB and GPOS), so letters still join.
- A font is flagged when its subset would be more than half smaller and more than 50 KB smaller.

## Example

### Wrong

```html
/* The whole font file, 140 KB, for a handful of letters. */
@font-face {
  font-family: 'Brand Arabic';
  src: url('/_shared/fonts/ibm-plex-sans-arabic-400.ttf') format('truetype');
  font-display: swap;
}
```

### Right

```html
/* A WOFF2 file of a size the page can carry. */
@font-face {
  font-family: 'Brand Arabic';
  src: url('/_shared/fonts/arablyzer-test-arabic.woff2') format('woff2');
  font-display: swap;
}
```

## How to fix

Use the file the tool makes, with the rule it gives you:

```css
@font-face {
  font-family: 'Brand Arabic';
  src: url('/fonts/brand-arabic-subset.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
  unicode-range: U+20,U+30-39,U+627-64A;
}
```

- Keep your full font in the list after it, if you want characters outside the subset to be drawn in it: `font-family: 'Brand Arabic', 'Brand Arabic Full', serif`. Without it, they fall back to the next font.
- When your pages show different text, make the subset from the text of all of them, or from a font split in several `unicode-range` files.
- The generated file is made for the text the page showed when we rendered it. A page that shows other letters later (a search result, a user's name) needs those letters too.

## FAQ

### Is a subset safe? Will my Arabic still join?

Yes, the shaping tables are kept: the forms a letter takes by position, and ligatures such as «لا», are made from them. The `unicode-range` in the rule tells the browser to use the file only for the characters it has, so anything else is drawn by the next font in your list.

### Do you keep the file I download?

No. It is made when you ask, from the font file your page loads, capped in size, sent to you and not stored. Nothing of the font is kept after the response.

### Why do you flag only a saving of 50 KB and half the file?

Because a smaller saving is not worth the work of keeping a second file in step with your design. The numbers are the rule's, and you can still download a subset for any font the tool lists.

### Can I subset a font that is not mine?

Check its licence first. Many fonts (the Google Fonts families, for example, under OFL) allow it; some forbid modifying the file. The tool does not check licences.

## Methodology

We render the page, read the font files it loaded and the Arabic text set in each font family, and make the subset with HarfBuzz's subsetter (the `hb-subset` library, as WebAssembly), with its layout closure on, so the shaping rules that reach the letters used are kept. The size we compare is the size of the file the browser received. See the rule's page for the details.
