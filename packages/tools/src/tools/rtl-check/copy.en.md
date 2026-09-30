---
summary: Does your page declare that it is Arabic and reads right to left?
---

# RTL checker

Checks that your Arabic page declares on its html element that it is Arabic and reads right to left, as browsers and screen readers need.

## What it checks

- The `<html>` element has `dir="rtl"` when most of the page's text is Arabic: not `ltr` or `auto`, and not on `<body>` alone.
- The `lang` attribute on `<html>` names a language written in Arabic script, such as `ar` or `ar-SA`, not `en` or an empty value.

## Example

### Wrong

```html
<!doctype html>
<html lang="en">
<body>
  <p>مرحباً بكم في متجرنا</p>
</body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
<body>
  <p>مرحباً بكم في متجرنا</p>
</body>
</html>
```

## How to fix

Put the language and the direction together on the `<html>` element:

```html
<html lang="ar" dir="rtl">
```

- In WordPress, choose Arabic under "Settings → General → Site Language"; themes that call `language_attributes()` then add both attributes themselves.
- If part of the page needs the other direction, such as a code sample or an English paragraph, put `dir="ltr"` on that element only.
- Add a country code when the content is meant for one country, such as `ar-SA`, `ar-AE` or `ar-OM`.

## FAQ

### Is `direction: rtl` in CSS enough?

No. Direction is part of the meaning of the text, so it belongs in the HTML, as W3C and the HTML specification recommend. Styles may not load or may be ignored, as in a browser's reader mode or when the content is copied elsewhere; the attribute stays with the text.

### Why is `dir="rtl"` on `<body>` not enough?

Elements outside `<body>` do not inherit it, including `<title>`, which shows in the browser tab and in bookmarks. Put it on `<html>` and everything on the page inherits it.

### Does Google use the `lang` attribute to tell the page's language?

Google says it determines a page's language from its visible content, not from the `lang` attribute. The attribute still matters: screen readers choose their pronunciation from it, browsers use it for fonts and translation offers, and WCAG 2.2 (success criterion 3.1.1) requires the page's language to be programmatically determined.

## Methodology

We fetch the page as `ArablyzerBot`, following its redirects, and read the HTML as the server sends it, before any JavaScript runs. We count the letters in the visible text; the tool applies when more than half of them are Arabic-script letters, which includes Persian, Urdu and other languages written in Arabic script. Then we apply two rules: the page's direction and its language. The same page gives the same result on every check.
