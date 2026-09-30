# Letter spacing

Letter spacing is the CSS letter-spacing property, extra space between characters; in Arabic it would break the joins between letters, and browsers do not agree on it.

## Definition

- `letter-spacing` is a CSS property that adds space between characters, on top of their normal spacing: positive values spread them apart, negative values draw them together, and `normal` adds none.
- Arabic letters join within a word. The W3C's Arabic Layout Requirements note that the only gaps inside an Arabic word come after letters that do not join the next one, and that moving joined letters apart gives undesirable results.
- CSS Text Level 3 lets a browser space a cursive script such as Arabic only by stretching its joins by the same total length; a browser that cannot must not add spacing between its letters at all. It advises authors to avoid letter spacing on cursive scripts unless they accept results that differ between browsers.

## Why it matters

- In Arablyzer's tests, Chromium and Firefox left the spacing out of Arabic text, while WebKit, the engine of Safari, drew it between the letters: the same page can look right in Chrome and broken on an iPhone.
- It usually comes from a Latin design: a heading style or a button class with `letter-spacing` that also applies to the Arabic version of the page.
- MDN warns that languages written in Arabic script expect connected letters to stay connected.

## Example

A shared style keeps its spacing for Latin text, and resets it for Arabic:

```css
.label {
  letter-spacing: 0.08em;
}
:lang(ar) .label {
  letter-spacing: 0;
}
```

The reset relies on `lang="ar"` on `<html>` or on the Arabic element itself.

## Common mistakes

- Checking the Arabic pages in Chrome only, where the spacing does not show.
- Widening an Arabic heading with spacing: a heavier weight or a larger size does it without breaking the joins.
- Stretching words with tatweel characters instead: that changes the text itself, not its style.

## References

- [W3C: CSS Text Module Level 3, letter-spacing in cursive scripts](https://www.w3.org/TR/css-text-3/#cursive-tracking)
- [MDN: letter-spacing](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/letter-spacing)
- [W3C: Arabic & Persian Layout Requirements, joining and spacing](https://www.w3.org/TR/alreq/#h_joining_and_spacing)
