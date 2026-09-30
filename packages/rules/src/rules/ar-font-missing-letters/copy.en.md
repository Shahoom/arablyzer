# Arabic font missing letters its text uses

## Messages

### missing

The font «{family}» lacks {characters}, which this page's text uses, so the browser draws them in another font, in the middle of words.

## Why it matters

- The browser draws each character with the first font in the list that has it. A character the site's font lacks is drawn with one of the visitor's own fonts, in a different shape, weight and height, inside a word set in another font.
- It happens most with characters that subset fonts leave out: «ڤ», «گ», «چ» and «پ» in names and brands, the Arabic-Indic digits «٠١٢٣», Arabic punctuation, and diacritics.
- How those characters look changes from one device to the next, and you may not notice when your own device's font resembles the site's.

## How to fix

- Use the whole font file, or add the missing characters to the subset you make from it: subsetting tools take a list of characters, so add everything your text uses.
- Or put a similar font that has them after it in `font-family`:

```css
body {
  font-family: 'Brand Arabic', 'Noto Naskh Arabic', serif;
}
```

- A font split into parts with `unicode-range` needs a part that covers every character the text uses.

## How we detect

1. We render the page in each engine and read the font files the browser loaded, and the stylesheets that tie each font to its files and their `unicode-range`, to know which characters each font has.
2. For each element whose own text has Arabic letters, we go down its `font-family` list as the browser does, and find the font that draws each character.
3. The rule fails when the web font that draws the Arabic letters lacks a character the text uses, and no web font after it in the list has it, so one of the device's fonts draws it.
4. We do not judge a character whose font file we did not read, such as a file still loading, or one whose size we could not know before reading it. When the Arabic letters themselves are not drawn by a web font, that is the web font without Arabic letters rule's finding, not this one's.
5. We report each font once, at the first element where it lacks a character, with every character it lacks on the page.

## References

- [W3C: CSS Fonts Module Level 4, the font matching algorithm](https://www.w3.org/TR/css-fonts-4/#font-matching-algorithm)
- [W3C: CSS Fonts Module Level 4, the unicode-range descriptor](https://www.w3.org/TR/css-fonts-4/#unicode-range-desc)
- [Microsoft: The cmap table in the OpenType specification](https://learn.microsoft.com/en-us/typography/opentype/spec/cmap)
