---
summary: Does the page have a single canonical URL that nothing contradicts?
---

# Canonical checker

Checks that your page gives Google a single canonical URL: no two tags pointing to different URLs, and no Link header that contradicts the URL in the tag.

## What it checks

- Whether `<head>` has more than one `<link rel="canonical">` tag pointing to different URLs, as when the theme and an SEO plugin each add one.
- Whether the canonical URL in the `Link` header differs from the one in the `<link rel="canonical">` tag.
- Whether the response's `Link` headers give more than one different canonical URL.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <title>دهن العود الكمبودي | متجر الواحة</title>
    <link rel="canonical" href="https://example.com/oud" />
    <link rel="canonical" href="https://example.com/oud?ref=home" />
  </head>
  <body>
    <h1>دهن العود الكمبودي</h1>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <title>دهن العود الكمبودي | متجر الواحة</title>
    <link rel="canonical" href="https://example.com/oud" />
  </head>
  <body>
    <h1>دهن العود الكمبودي</h1>
  </body>
</html>
```

## How to fix

Keep a single canonical URL, as a full URL, from a single source:

```html
<link rel="canonical" href="https://example.com/oud" />
```

- When the page has two tags, remove one, or turn off the one added by the theme or the SEO plugin.
- When you use a `Link` header, point it to the same URL as the tag, or remove one of them.
- Put the tag inside `<head>`; Google ignores it inside `<body>`.

## FAQ

### Is a missing canonical URL a mistake?

The tool does not count it as one: it checks for conflicts only, and does not apply to a page without a canonical URL. When a page does not name its original, Google chooses one itself. Naming it helps when many URLs lead to the page, such as versions with `?ref=` or a different product order.

### Are `https://example.com/oud` and `https://example.com/oud/` the same URL?

No. A trailing slash makes a URL different, so when a tag points to one and a header to the other, the check fails. The part after `#` is dropped before comparing, and relative URLs are turned into full ones, so those differences are not a conflict.

### Does the tool check the page the canonical URL points to?

No. We compare the canonical URLs the page gives with one another only, and do not fetch the page they point to.

## Methodology

We fetch the page as `ArablyzerBot`, follow its redirects, and read its headers and HTML as the server sends them, before any JavaScript runs. We collect `<link rel="canonical">` tags inside `<head>` and `rel="canonical"` links in `Link` headers, turn each into a full URL, based on `<base>` when present or on the page's URL, and drop the part after `#`. Then we apply one rule: it fails when more than one different URL remains, and the evidence lists every URL and its source. The same page gives the same result on every check.
