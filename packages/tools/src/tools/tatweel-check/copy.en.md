---
summary: Does your page have words stretched with tatweel that search may not find?
---

# Tatweel (kashida) checker

Finds words on your Arabic page stretched with tatweel (ـ) between their letters, which people searching without it may not find, and shows each word without tatweel.

## What it checks

- Words with tatweel (ـ) between two Arabic letters, such as `الـعـروض`, even with harakat on the letters.
- The first stretched word in each text, with the number of stretched words in it, and the word without tatweel, as people search for it.
- What the tool leaves out: tatweel after a word's last letter, such as «بـ» before a Latin word, lines made of tatweel alone, and tatweel that carries a superscript alef or a hamza in Quranic spelling, such as «ٱلرَّحْمَـٰنِ».

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>العروض الخاصة</title>
  </head>
  <body>
    <h1>الـعـروض الـخـاصـة</h1>
    <p>خصم على كل العطور هذا الأسبوع.</p>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>العروض الخاصة</title>
  </head>
  <body>
    <h1>العروض الخاصة</h1>
    <p>خصم على كل العطور هذا الأسبوع.</p>
  </body>
</html>
```

## How to fix

Remove the tatweel characters from inside words: write «العروض» instead of `الـعـروض`. For a prominent heading, leave its look to CSS; the font, its weight and its size do not change the letters of the text:

```html
<h1 class="offers">العروض الخاصة</h1>
<style>
  .offers {
    font-size: 2.5rem;
    font-weight: 800;
  }
</style>
```

- To fill the lines of a paragraph, use `text-align: justify` rather than stretching words with tatweel.
- If the text is copied from a design program or a document, search it for the tatweel character `ـ` (`U+0640`) and remove it from inside words before publishing.
- Tatweel after a word's final letter, as in «الدفع بـ Apple Pay», is an accepted use, and the tool does not count it.

## FAQ

### Why do stretched words matter?

Tatweel is a character of its own in the text, so the letters of `الـعـروض` are not those of «العروض». Search on a site, and many search tools, match letters as they are, so someone who types the word without tatweel may not find it. When the word is copied, the tatweel characters go with it into messages and documents.

### Does the tool count «بـ» before Latin words?

No. Tatweel after a word's last letter, as in «الدفع بـ Apple Pay», is an accepted use that the tool does not count. Nor does it count lines made of tatweel alone, such as «ـــــ», or tatweel that carries a superscript alef or a hamza in Quranic spelling, such as «ٱلرَّحْمَـٰنِ».

### How do I remove tatweel from a long text?

Search for the tatweel character `ـ` in your text editor and replace it with nothing, then put back what is needed, such as «بـ» before a Latin word. If the text quotes verses in Quranic spelling, leave them out, since tatweel there carries marks such as the superscript alef.

## Methodology

We fetch the page as `ArablyzerBot`, following its redirects, and read the visible text in the HTML as the server sends it, before any JavaScript runs, leaving out code tags such as `<code>`. The tool applies when more than half of the visible text's letters are Arabic-script letters. We split each text into words, and a word counts as stretched when the tatweel character (`U+0640`) stands between two of its Arabic letters, even with harakat on them; we report the first stretched word in each text, with the number of stretched words in it. The same page gives the same result on every check.
