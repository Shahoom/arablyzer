---
summary: Does your page write numbers in two different systems, Western and Eastern Arabic?
---

# Digit consistency checker

Checks that your Arabic page writes numbers in one system, Western or Eastern Arabic digits, and finds Persian digits, some of which differ in shape from Arabic ones.

## What it checks

- The page writes its numbers in one system: Western digits `0-9` or Eastern Arabic digits `٠-٩`, not both.
- Persian digits, such as `۴`, `۵` and `۶`, in Arabic text, whose shapes differ from `٤`, `٥` and `٦`.
- The first number of the system the page uses less, so it is easy to find.
- Numbers that stand on their own, with their separators and decimal marks, such as `٤٫٥` and `1,500`; not numbers next to Latin words such as "iPhone 15", international phone numbers that start with `+`, or the year after ©.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>تمر المجدول</title>
  </head>
  <body>
    <p>علبة تمر مجدول وزنها 500 غرام، فيها نحو 20 حبة.</p>
    <p>السعر ٤٫٥٠٠ ريال عماني، والشحن مجاني للطلبات فوق ١٥ ريالاً.</p>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>تمر المجدول</title>
  </head>
  <body>
    <p>علبة تمر مجدول وزنها 500 غرام، فيها نحو 20 حبة.</p>
    <p>السعر 4.500 ريال عماني، والشحن مجاني للطلبات فوق 15 ريالاً.</p>
  </body>
</html>
```

## How to fix

Choose one digit system for the whole site, and keep to it in text, prices and tables. If some numbers come from the database or a plugin, format them the same way in the template; in JavaScript, the `-u-nu-` part of the locale sets the digits:

```html
<script>
  const price = 4.5
  // Western digits: 4.500
  price.toLocaleString('ar-SA-u-nu-latn', { minimumFractionDigits: 3 })
  // Eastern Arabic digits: ٤٫٥٠٠
  price.toLocaleString('ar-SA-u-nu-arab', { minimumFractionDigits: 3 })
</script>
```

- Replace Persian digits with Eastern Arabic ones, `٤`, `٥` and `٦` for `۴`, `۵` and `۶`, or with Western ones.
- The tool does not count international phone numbers and product names such as "iPhone 15", so there is no need to change them.

## FAQ

### What is the difference between Arabic and Indian digits?

It depends on who is naming them. The digits `٠١٢٣` are often called "Indian digits" in the Arab East, and Unicode calls them Arabic-Indic, while `0123` are called "Arabic" or "English" digits. The tool calls the first Eastern Arabic digits and the second Western digits. Both are right in Arabic text; what matters is choosing one.

### Does the tool count phone numbers and product names?

No. We leave out numbers next to Latin words, such as "iPhone 15" and "Windows 11", international phone numbers that start with `+`, and the year after ©, since those are usually written in Western digits.

### Why does the tool not apply to my Persian or Urdu page?

Because those digits are theirs. We leave out pages that declare in `<html lang>` another language written in Arabic script, such as Persian (`fa`) or Urdu (`ur`), and check pages where most of the text's letters are Arabic.

## Methodology

We fetch the page as `ArablyzerBot`, following its redirects, and read the visible text in the HTML as the server sends it, before any JavaScript runs, leaving out code tags such as `<code>`. The tool applies to pages where most letters are Arabic, except those that declare another language written in Arabic script. We collect the numbers that stand on their own and sort each by its digits: Western (`U+0030–U+0039`), Eastern Arabic (`U+0660–U+0669`) or Persian (`U+06F0–U+06F9`). The tool fails when the page has both Western and Eastern Arabic digits, pointing at the first number of the system used less, and also when it has Persian digits. The same page gives the same result on every check.
