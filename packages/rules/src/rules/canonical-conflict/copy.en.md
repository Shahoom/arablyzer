# Conflicting canonical URLs on the page

## Messages

### multiple-tags

The page has more than one `<link rel="canonical">` tag, and they point to different URLs.

### header-mismatch

The canonical URL in the Link header ({headerUrl}) differs from the one in `<link rel="canonical">` ({tagUrl}).

### multiple-headers

The response's Link headers give more than one different canonical URL.

## Why it matters

- The canonical URL tells Google which version of a page is the original when many URLs lead to it, such as versions with `?ref=` or a different product order.
- Google asks for one canonical URL per page. When a page gives conflicting ones, Google may ignore all of them and choose the original itself, possibly a version you do not want.
- The conflict can come from two sources that both add the tag, such as the theme and an SEO plugin, or from server settings that add the header.

## How to fix

Keep a single canonical URL, as a full URL, from a single source:

```html
<link rel="canonical" href="https://example.com/oud" />
```

- When the page has two tags, remove one, or turn off the one added by the theme or the SEO plugin.
- When you use a `Link` header, point it to the same URL as the tag, or remove one of them.
- Put the tag inside `<head>`; Google ignores it inside `<body>`.

## How we detect

1. We collect `<link rel="canonical">` tags inside `<head>` and `rel="canonical"` links in `Link` headers.
2. We turn each into a full URL, based on `<base>` when present or the page's URL, and drop the part after `#`.
3. When more than one different URL remains, the rule fails, and the evidence lists every URL and its source. Identical URLs are not a conflict, and a trailing slash makes a URL different.

## References

- [Google: How to specify a canonical URL with rel="canonical" and other methods](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google Search Central Blog: 5 common mistakes with rel=canonical](https://developers.google.com/search/blog/2013/04/5-common-mistakes-with-relcanonical)
- [RFC 6596: The Canonical Link Relation](https://www.rfc-editor.org/rfc/rfc6596.html)
