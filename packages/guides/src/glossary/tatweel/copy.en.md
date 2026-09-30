# Tatweel (kashida)

Tatweel, also called kashida, is the Arabic character that stretches the join between two letters; typed into words, it changes the text itself, not only its look.

## Definition

- Tatweel is the character `ـ` (`U+0640`, ARABIC TATWEEL). Unicode notes that it is also called kashida, and that it is inserted to stretch characters or to carry diacritics with no base letter. Placed between two joined letters, it widens the join between them, as in «`مـحـمـد`».
- Kashida is also the name of the stretching itself, used to justify Arabic lines. The W3C's Arabic Layout Requirements tell them apart: kashida is done by the layout, while tatweel is a character in the text, with a fixed width.
- Tatweel after a word's last letter, such as «`بـ`» before a Latin word, is a common use, and Arablyzer's rule does not count it.

## Why it matters

- Tatweel is part of the text, not of its style. A search that compares text exactly, such as a site's search box, may not match «`الـعـروض`» with «العروض», and copying the word carries the extra characters into messages and documents.
- Stretching typed into the text is tied to one design: screen widths and fonts change, and the characters stay.
- Headings get the same emphasis from CSS without touching the words: the font, its weight and size, and `text-align: justify` to fill a line.

## Example

The same heading, stretched in the text and styled with CSS:

```html
<!-- The word itself changes -->
<h2>الـعـروض</h2>

<!-- The look comes from CSS -->
<h2 class="offers">العروض</h2>
```

```css
.offers { font-size: 2rem; font-weight: 700; }
```

## Common mistakes

- Stretching words in headings, buttons and product names to fill a width.
- Keeping tatweel in page titles and product names, which carries it into search results and shared links.
- Using tatweel only to force a letter's joined form, as in some abbreviations: the W3C recommends the zero width joiner (`U+200D`), since tatweel also widens the letter.

## References

- [W3C: Arabic & Persian Layout Requirements, tatweel](https://www.w3.org/TR/alreq/#h_justification_tatweel)
- [W3C: Arabic & Persian Layout Requirements, joining enforcement](https://www.w3.org/TR/alreq/#h_joining_enforcement)
- [Unicode: the Arabic code chart, `U+0640`](https://www.unicode.org/charts/PDF/U0600.pdf)
