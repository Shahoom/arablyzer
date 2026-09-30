# Canonical URL

A canonical URL is the URL Google chooses to stand for a set of identical or very similar pages, and shows in results instead of their other copies.

## Definition

- When several URLs lead to the same content, Google picks one of them to represent it in search results, and calls it the canonical URL; the choosing is canonicalization.
- You can tell Google which URL you prefer, with a `<link rel="canonical">` tag in the page’s `<head>`, a `Link` header in the server’s response, your sitemap and your redirects. But your preference is a hint, not a rule: Google may choose another URL.

## Why it matters

- Sites make copies of their pages without meaning to: an `http` URL and an `https` one, copies with `?ref=` or another sort order, a copy for each country.
- If Google does not know which copy you want, it may pick one you do not want in results, and the signals spread across the copies.
- On sites in Arabic and English, each language version names itself as its canonical: the English page’s canonical is not the Arabic page, and `hreflang` says how the two relate.

## Example

A product page that several URLs reach, all of them suggesting the same URL:

```html
<!-- On https://example.com/oud?ref=home and on https://example.com/oud -->
<link rel="canonical" href="https://example.com/oud">
```

## Common mistakes

- Two tags on the page pointing to different URLs, as when the theme adds one and an SEO plugin another.
- A relative or mistyped canonical, or one pointing to a page that redirects or answers with an error.
- Making the home page the canonical of every page.
- Putting the tag in `<body>`, where Google ignores it.

## References

- [Google Search Central: What is URL canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization)
- [Google Search Central: How to specify a canonical URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
