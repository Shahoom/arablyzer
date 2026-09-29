---
summary: Does your page declare its language with a code screen readers can use?
---

# HTML lang checker

Checks that your Arabic page declares its language on the html element and that each lang attribute inside it is a valid code, so screen readers read every part right.

## What it checks

- The `<html>` element has a non-empty `lang` attribute when most of the page's text is Arabic.
- The declared language is written in Arabic script, such as `ar` or `ar-SA`, or `fa` for Persian and `ur` for Urdu, not `en`.
- Each `lang` attribute on an element inside the page is a valid language code, such as `lang="en"`, not `lang="english"`.

## Example

### Wrong

```html
<html lang="en" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>عن متجر العطور</title>
```

### Right

```html
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>عن متجر العطور</title>
```

## How to fix

Declare the page's language on `<html>`, with its direction, and the language of each part in another language on its own element:

```html
<html lang="ar" dir="rtl">
  <body>
    <p>الدفع متاح بـ <span lang="en">Apple Pay</span> لكل الطلبات.</p>
  </body>
</html>
```

- Write the language code, not its name: `ar` for Arabic and `en` for English, not `arabic` or `english`.
- Add a country code when the content is meant for one country, such as `ar-SA`, `ar-AE` or `ar-OM`.
- In WordPress the attribute comes from the site language under "Settings → General"; other systems usually set it from their language settings or the theme template.

## FAQ

### My page is in Arabic with some English words. Which language do I declare?

Declare Arabic on `<html>`, and put `lang="en"` on the elements that hold English text, such as a product name or a payment method: `<span lang="en">Apple Pay</span>`. The tool applies to a page when more than half of the letters in its visible text are Arabic.

### Does a `content-language` meta tag replace the `lang` attribute?

No. Screen readers use the `lang` attribute, and a `<meta http-equiv="content-language">` tag does not replace it. When the page has one, we list it in the result's evidence.

### Why does the language code matter if Google tells a page's language from its text?

Because `lang` is not for Google alone: screen readers choose their voice and pronunciation from it, so an Arabic page declared as English is read with English pronunciation nobody can follow. Browsers rely on it for font choice and word-breaking rules, and may offer to translate a page already in the visitor's language. And WCAG 2.2 asks that the page's language be programmatically determined (success criterion 3.1.1), and the language of each passage in another language too (3.1.2).

## Methodology

We fetch the page as `ArablyzerBot`, following its redirects, and read the HTML as the server sends it, before any JavaScript runs, decoding it as browsers do, older `windows-1256` pages included. We count the letters in the visible text; when more than half of them are Arabic, we read the `lang` attribute of `<html>`, which passes when it declares a language written in Arabic script, such as Arabic, Persian or Urdu, or any tag with `-Arab`. Then we render the page in Chromium, Firefox and WebKit, each behind Arablyzer's egress proxy, and run axe-core 4.13.0's `valid-lang` rule on the rendered page: it reports each element inside it, other than `<html>`, whose `lang` does not start with a known language code. The same page gives the same result on every check.
