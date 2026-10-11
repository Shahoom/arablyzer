---
summary: Can AI assistants and search read your Arabic text, or is it stretched with tatweel, split by invisible characters or drawn in pictures?
---

# Arabic AI readability checker

Reads an Arabic page's text the way a tokenizer does and finds what makes the same word a different one to a machine than to a person: tatweel inside words, invisible characters, digits of two sets in one number, fully vowelled paragraphs, presentation-form letters, and Arabic that is in pictures and not in text.

## What it checks

- Tatweel (ـ) between two letters: `الـعـروض` is not «العروض» to a search index.
- Invisible characters inside words: zero-width space, word joiner, a stray byte-order mark, a direction mark between letters.
- Numbers that mix Arabic-Indic and Latin digits: `٢٠٢4`.
- Paragraphs with a mark on nearly every letter (fully vowelled), and letters in presentation forms (U+FB50 to U+FEFF).
- Pages with little Arabic text whose images carry Arabic sentences in their alt text.

## Example

### Wrong

```html
<h1>الـعـروض الـخـاصـة</h1>
```

### Right

```html
<h1>العروض الخاصة</h1>
```

## How to fix

1. Write words plainly, without tatweel; if you want a stretched look, get it from a font or CSS, not from characters in the text (`letter-spacing` breaks Arabic letters apart: never use it).
2. Search the source for U+200B, U+2060 and U+FEFF and delete them; keep a direction mark between words only.
3. Use one digit set in a number: `٢٠٢٤` or «2024».
4. Keep full vowelling for the Qur'an and teaching texts; for ordinary pages write plain letters.
5. Copy Arabic from a word processor or a PDF with care: they can paste presentation-form letters. Retype or normalise to plain letters.
6. Put text in the page, not in images: an image can have an `alt`, but a paragraph in a picture is invisible to a machine.

For example:

```sh
grep -rnP "\x{200B}|\x{2060}|\x{FEFF}" src/ templates/
```

## FAQ

### Does this affect my ranking?

Not as a penalty. It affects what the machines read: a word with tatweel or a hidden character may not match the query that people type, and an assistant cannot quote what it cannot read as text.

### Why is tatweel flagged? It is only decoration.

To the eye. To a tokenizer or an index, `الـعـروض` is a different string from «العروض». Use CSS or a font for the look.

### Is full vowelling always wrong?

No, for the Qur'an, poetry and teaching texts it is right. The check reports paragraphs where nearly every letter carries a mark, so you can decide.

### Does it check my images?

Only whether a page with little Arabic text has Arabic sentences in its images' alt text, a sign that the text is in pictures. It does not read the pictures.

## Methodology

We read the visible text of an Arabic page's HTML, leaving out code, and count each kind: words with tatweel, words with an invisible character, numbers that mix digit sets, paragraphs of 20 Arabic letters or more where marks are a quarter of the letters or more, words in presentation forms, and the pictures case (fewer than 60 Arabic letters and alt texts that are Arabic sentences of eight words or more). Each kind is reported once, with how many and the first. See the rule's page for the details.
