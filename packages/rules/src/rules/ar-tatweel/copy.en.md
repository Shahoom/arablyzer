# Words stretched with tatweel (ـ)

## Messages

### stretched

The word «{word}» is stretched with tatweel (ـ) between its letters, so people searching for «{clean}» may not find it.

## Why it matters

- **Search**, on the site, in the browser's find tool and in many search engines, treats «`مـحـمـد`» as a different word from «محمد», since tatweel is a character of its own in the text.
- **Copying and pasting** carries the tatweel characters with the word into messages and documents, where the word stays stretched.
- Tatweel used to shape the text on screen ties the look to the content: screen widths and fonts change, and the extra characters stay in the text.

## How to fix

- Remove tatweel characters from inside words: write «العروض» instead of «`الـعـروض`».
- For prominent headings, use CSS: the font, its weight and its size, and `text-align: justify` if you want to fill the lines.
- Tatweel after a word's final letter, such as «بـ» before a Latin word («الدفع بـ Apple Pay»), is an accepted use, and the rule does not count it.

## How we detect

1. We read the visible text in the page's HTML as the server sends it, on pages where most letters are Arabic, leaving out code tags such as `<code>`.
2. A word counts as stretched when tatweel (ـ) stands between two of its Arabic letters, even with harakat on them.
3. Tatweel after a word's last letter, such as «بـ», does not count, and neither do lines made of tatweel alone, such as «ـــــ», nor tatweel that carries a superscript alef or a hamza in Quranic spelling, such as «ٱلرَّحْمَـٰنِ».
4. We report the first stretched word in each text, with the number of stretched words in it.

## References

- [W3C: Arabic and Persian Layout Requirements, kashida and tatweel](https://www.w3.org/TR/alreq/#h_justification_tatweel)
- [Unicode: the Arabic code chart, tatweel at `U+0640`](https://www.unicode.org/charts/PDF/U0600.pdf)
