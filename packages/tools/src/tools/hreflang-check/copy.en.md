---
summary: Are the hreflang codes on your page language and country codes Google understands?
---

# hreflang checker

Checks that the hreflang codes on your page are the ISO language and country codes Google needs to show each searcher the right version: ar-SA, not ar-KSA or ar_SA.

## What it checks

- The `hreflang` values in `<link rel="alternate">` elements on the page, and in `Link` headers in the HTTP response.
- Each value is `x-default`, or a two-letter ISO 639-1 language code, then an optional ISO 15924 script code, then an optional two-letter ISO 3166-1 country code.
- Underscores instead of hyphens, as in `ar_SA`, and country codes that are not in ISO 3166-1, such as `KSA` and `UAE`.
- `UK` for the United Kingdom, whose code is `GB`.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <link rel="alternate" hreflang="ar-KSA" href="https://example.com/sa/" />
    <link rel="alternate" hreflang="ar_AE" href="https://example.com/ae/" />
    <link rel="alternate" hreflang="en-UK" href="https://example.com/uk/" />
  </head>
  <body>
    <h1>عروض الأسبوع</h1>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <link rel="alternate" hreflang="ar-SA" href="https://example.com/sa/" />
    <link rel="alternate" hreflang="ar-AE" href="https://example.com/ae/" />
    <link rel="alternate" hreflang="en-GB" href="https://example.com/uk/" />
    <link rel="alternate" hreflang="x-default" href="https://example.com/" />
  </head>
  <body>
    <h1>عروض الأسبوع</h1>
  </body>
</html>
```

## How to fix

Use a two-letter language code, then a two-letter country code when you target one country, joined by a hyphen:

```html
<link rel="alternate" hreflang="ar-SA" href="https://example.com/sa/" />
<link rel="alternate" hreflang="ar-AE" href="https://example.com/ae/" />
<link rel="alternate" hreflang="ar-OM" href="https://example.com/om/" />
<link rel="alternate" hreflang="en" href="https://example.com/en/" />
<link rel="alternate" hreflang="x-default" href="https://example.com/" />
```

- Gulf country codes: Saudi Arabia `SA`, UAE `AE`, Oman `OM`, Kuwait `KW`, Bahrain `BH`, Qatar `QA`.
- `ar` alone means Arabic for every country, and `x-default` marks the version shown when no other version fits the searcher.
- Do not write a country code on its own: `SA` alone is a valid language code (Sanskrit), not Saudi Arabia, so the tool does not flag it.
- If the codes come from your software's language settings, such as `ar_SA`, write them with a hyphen: `ar-SA`.

## FAQ

### Should I use `ar` or `ar-SA`?

Both are valid. `ar` means Arabic for every country, and `ar-SA` means Arabic for people in Saudi Arabia. Use a country code when each country has its own version, such as with different prices or currency; otherwise `ar` is enough.

### Why are `KSA`, `UAE` and `UK` wrong?

They are not ISO 3166-1 country codes, and Google accepts ISO codes only. The right codes are `SA` for Saudi Arabia, `AE` for the UAE and `GB` for the United Kingdom; `UK` is only reserved in ISO 3166-1, not assigned to a country.

### Does the tool check that the versions point to each other?

No. Google asks each version to list itself and every other version, but checking that means fetching the other pages, and the tool checks only the page you give it.

### I put `hreflang` in my sitemap. Does the tool check it?

No. The tool reads the page's tags and its response headers only. If your codes are in the sitemap alone, the tool finds nothing to check and says the check does not apply to the page.

## Methodology

We fetch the page as `ArablyzerBot`, following its redirects, and read the HTML as the server sends it, before any JavaScript runs, together with the response headers. We collect `hreflang` values from `<link rel="alternate">` elements and `Link` headers, and accept `x-default`, or an ISO 639-1 language code, then an optional ISO 15924 script code, then an optional ISO 3166-1 alpha-2 country code, in any letter case. The code lists come from the IANA Language Subtag Registry; the country list holds only the officially assigned ISO 3166-1 codes. Each invalid code is its own finding, naming the part at fault and the correction when it is clear. The same page gives the same result on every check.
