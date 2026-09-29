---
summary: Does your Arabic text have Latin commas or question marks after Arabic words?
---

# Arabic punctuation checker

Finds Latin commas, semicolons and question marks right after Arabic words on your page, and shows where each one is and the Arabic mark that replaces it.

## What it checks

- The Latin comma `,`, semicolon `;` and question mark `?` right after an Arabic letter, even one with a diacritic or tatweel.
- A mark after an Arabic word inside an inline tag, as in `<b>كلمة</b>,`.
- The Arabic mark that replaces each one, `،`, `؛` and `؟`, with the mark's line in the HTML and the text around it.
- Visible text only: marks in code, in links and paths, and after digits and Latin letters, such as `1,500` and `React, Vue`, do not count.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>الدعم الفني</title>
  </head>
  <body>
    <p>هل تريد المساعدة? تواصل معنا, نحن هنا طوال أيام الأسبوع.</p>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>الدعم الفني</title>
  </head>
  <body>
    <p>هل تريد المساعدة؟ تواصل معنا، نحن هنا طوال أيام الأسبوع.</p>
  </body>
</html>
```

## How to fix

Replace the Latin mark with the Arabic one when it follows an Arabic word:

| Instead of | Use |
|---|---|
| `,` | `،` |
| `;` | `؛` |
| `?` | `؟` |

Leave the comma in numbers, between English words and in code as it is:

```html
<p>نرد على الرسائل خلال ساعات العمل؛ وفي العطل نرد في اليوم التالي.</p>
<p>الاشتراك السنوي بسعر 1,500 ريال، ويعمل مع مواقع React, Vue وغيرها.</p>
<p>مثال للمطورين: <code>أيام = [السبت, الأحد]</code></p>
```

- Do not replace them blindly across the site: a search and replace changes the commas in numbers, links and code too.
- Most Arabic keyboard layouts include the Arabic marks, so it is easiest to type them from the start rather than fix them later.

## FAQ

### Should I replace every Latin comma on the page?

No. The comma inside numbers such as `1,500`, between English words such as `React, Vue`, and in code and links stays as it is, and the tool does not count it. We check only the mark that comes right after an Arabic letter.

### What about the full stop and the exclamation mark?

The tool does not check them. We check the comma, the semicolon and the question mark because Arabic writes them with marks of its own, `،`, `؛` and `؟`, each with its own Unicode character. Arabic text usually writes the full stop and the exclamation mark with the same characters as Latin text.

### Does the tool check text that JavaScript adds?

No. We read the page's HTML as the server sends it, before any JavaScript runs, so text that scripts add after loading is not seen. If your site builds its text in the browser, check the punctuation at its source too.

## Methodology

We fetch the page as `ArablyzerBot`, following its redirects, and read the visible text in the HTML as the server sends it, before any JavaScript runs. The tool applies when more than half of the visible text's letters are Arabic-script letters. We look for an Arabic letter, optionally followed by diacritics or tatweel, immediately followed by `,`, `;` or `?`, and we follow the text across inline tags. We skip code tags (`code`, `pre`, `kbd`, `samp`) and words that contain `/`, which are links or paths, and each mark is its own finding, with its line and the text around it. The same page gives the same result on every check.
