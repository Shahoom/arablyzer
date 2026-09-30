---
summary: Type the URLs of your page's versions and their languages, and get a full set of hreflang tags with codes Google accepts.
---

# hreflang tag generator

Writes the hreflang tags for every version of your page, Arabic, English or any other, as one set you put in every version, and checks that each language and region code in it is one Google accepts.

## What it checks

- The language code: one of the two-letter ISO 639-1 codes, such as `ar` and `en`, not three-letter codes such as `ara`.
- The region code after the language, if you give one: one of the two-letter ISO 3166-1 codes, such as `ar-SA` and `ar-AE`, with `GB` for the United Kingdom, not `UK`.
- A hyphen between language and region: `ar-SA`, not `ar_SA`.
- The `x-default` URL, if you add one: the page for people whose language matches no version.

## Example

### Wrong

```html
<link rel="alternate" hreflang="ara" href="https://example.com/" />
<link rel="alternate" hreflang="eng" href="https://example.com/en/" />
```

### Right

```html
<link rel="alternate" hreflang="ar" href="https://example.com/">
<link rel="alternate" hreflang="en" href="https://example.com/en/">
<link rel="alternate" hreflang="x-default" href="https://example.com/">
```

## How to fix

Type each version's URL and its language code, add an `x-default` URL if you want one, then copy the tags and put them in the `<head>` of every version, not just one:

```html
<!-- A version for Saudi Arabia, one for the UAE, and an English one -->
<link rel="alternate" hreflang="ar-SA" href="https://example.com/sa/">
<link rel="alternate" hreflang="ar-AE" href="https://example.com/ae/">
<link rel="alternate" hreflang="en" href="https://example.com/en/">
<link rel="alternate" hreflang="x-default" href="https://example.com/">
```

- The same tags go in every version: each version names itself and the others.
- Write full URLs, starting with `https://`.
- Add a region when the versions differ from one country to another, such as a page in Saudi riyals and another in UAE dirhams: `ar-SA` and `ar-AE`. Otherwise the language code alone, such as `ar`, is enough.

## FAQ

### Do the tags go in every version, or only the Arabic one?

In every version. Google asks that each version name itself and the others, and when two versions do not point to each other, it may ignore their tags.

### Do I need x-default?

It is not required, and Google recommends it: give it the page for people whose language matches no version, usually a language picker or the main version.

### Do hreflang tags replace the page's lang attribute?

No. The `lang` attribute on `<html>` tells browsers and screen readers the page's language; hreflang tags tell search engines where its other versions are.

### Does what I type reach Arablyzer?

No. The generator runs in your browser, and nothing you type leaves it.

## Methodology

The generator runs in your browser, with the code the `hreflang-invalid-code` rule checks pages with: we split each code into a language, a script and a region, and look up the language among the ISO 639-1 codes, the script among the ISO 15924 codes, and the region among the two-letter ISO 3166-1 codes, as Google's documentation asks. We write the tags in the order you entered them, with `x-default` last if you gave one.
