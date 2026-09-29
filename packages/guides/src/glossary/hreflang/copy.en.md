# hreflang

hreflang is an attribute that tells Google a page has versions in other languages or for other countries, so it can show each searcher the one for their language or country.

## Definition

- When a page has versions for other languages or regions, `hreflang` tells Google about them so it can show each searcher the right one. It goes in `<link rel="alternate">` elements in the `<head>`, in a `Link` response header, or in the sitemap.
- Its value is an ISO 639-1 language code, optionally followed by an ISO 3166-1 Alpha 2 region code after a hyphen, such as `ar-SA`. The value `x-default` marks the version for searchers no other version fits.

## Why it matters

- On a site in Arabic and English, `hreflang` links the Arabic page to its English version, so Google shows each searcher the version for their language.
- Country versions in Arabic, such as `ar-SA` and `ar-AE`, are duplicates while their text is the same; `hreflang` tells Google they are local versions of the same content. Add a generic `ar` version for Arabic searchers elsewhere.
- If two pages do not both point to each other, Google ignores the tags. And Google does not use `hreflang` or `lang` to detect a page's language: its algorithms do.

## Example

The Arabic page at the root and the English one under `/en/`, with the same tags in the `<head>` of both:

```html
<link rel="alternate" hreflang="ar" href="https://example.com/">
<link rel="alternate" hreflang="en" href="https://example.com/en/">
<link rel="alternate" hreflang="x-default" href="https://example.com/">
```

Each version lists itself and the others, with fully qualified URLs.

## Common mistakes

- Missing return links: the Arabic page points to the English one, but the English page does not point back.
- Codes from outside the standards: `UK` instead of `GB`, `KSA` and `UAE` instead of `SA` and `AE`, and an underscore, as in `ar_SA`, instead of a hyphen.
- A country code on its own: `SA` alone is the language code for Sanskrit, not Saudi Arabia.
- Relative URLs such as `/en/`, or `http` URLs instead of the canonical `https` ones.

## References

- [Google Search Central: Tell Google about localized versions of your page](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google Search Central: How to specify a canonical URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [IANA: Language Subtag Registry](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry)
