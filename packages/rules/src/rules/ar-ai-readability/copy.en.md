# Arabic text that machines read badly

## Messages

### tatweel

{count} word(s) are stretched with tatweel (ـ) inside, such as «{example}»: a search index or an AI assistant sees a different word from «{clean}».

### invisible

{count} word(s) hold an invisible character, such as «{example}»: a zero-width space, a word joiner, a stray byte-order mark, or a direction mark inside a word. The word looks whole on screen and reads as two to a tokenizer.

### digits

{count} number(s) mix Arabic-Indic and Latin digits, such as «{example}», so a machine cannot read them as one number.

### diacritics

{count} paragraph(s) are fully vowelled, such as «{example}…»: nearly every letter carries a mark, which splits words for search and retrieval tools that expect plain letters.

### presentation

{count} word(s) are written with presentation-form letters (U+FB50 to U+FEFF), such as «{example}», which is «{normalized}» in plain letters: the shapes look the same on screen, but they are different characters to search and to AI.

### image-text

The page has little Arabic text of its own, and its images carry sentences in their alt text, such as «{example}» ({count} images): it looks as if the Arabic text is in pictures, which a machine cannot read.

## Why it matters

- **AI assistants and search engines read characters, not shapes.** Their tokenizers split text at the characters in it, so tatweel, a zero-width space or a presentation-form letter makes the same word a different one from the word people type in a question.
- **Retrieval depends on matching.** A passage whose «العروض» has a zero-width space in it is not found by a question that asks for «العروض», and an answer cannot quote it cleanly.
- **Numbers and prices are the facts assistants quote.** A number in two digit sets (٢٠٢4) is read as two numbers or none.
- **Text in pictures is invisible to them.** An AI that reads the page sees no sentence where the sentence is a pixel image.

## How to fix

- Tatweel: write the word plainly («العروض»), and stretch headings with CSS if you want that look.
- Invisible characters: delete them. Search the source for U+200B, U+2060 and U+FEFF; keep a direction mark only between words, not inside one.
- Digits: use one digit set in a number: «٢٠٢٤» or «2024», not both.
- Diacritics: keep them for the words that need them to be read right, and write running text plain.
- Presentation forms: type the base letters, or convert the text with Unicode normalization (NFKC) before it is stored:

```js
text.normalize('NFKC')
```

- Text in pictures: put the sentences in HTML as text, and keep the alt for what the picture shows.

## How we detect

1. We read the visible text of the page's HTML on pages in Arabic, and leave out code tags.
2. Tatweel: a word with tatweel between two Arabic letters, as the tatweel rule counts it.
3. Invisible characters: U+200B, U+2060 or U+FEFF in a word, or a direction mark (U+200E, U+200F, U+061C) between two letters or digits.
4. Digits: one number, with its separators, that holds Arabic-Indic or Persian digits together with 0 to 9.
5. Diacritics: paragraphs of 20 Arabic letters or more where marks are a quarter of the letters or more, reported when they hold 100 letters in all; paragraphs with Quranic annotation marks are left out.
6. Presentation forms: letters in U+FB50 to U+FEFE, leaving out the ornate parentheses and the symbols ﷺ ﷻ ﷼ ﷽.
7. Pictures: fewer than 60 Arabic letters in the page's text, and image alt texts that are Arabic sentences of eight words or more.
8. We report each kind once, with how many we found and the first one.

## References

- [Unicode: Arabic Presentation Forms-A](https://www.unicode.org/charts/PDF/UFB50.pdf)
- [Unicode Standard Annex 15: normalization forms (NFKC)](https://www.unicode.org/reports/tr15/)
- [W3C: Arabic and Persian Layout Requirements](https://www.w3.org/TR/alreq/)
