# “Duplicate without user-selected canonical” in Search Console: what it means and how to fix it

What the Page indexing report means by “Duplicate without user-selected canonical”, and how to tell Google which URL you want as the canonical.

## What it means

- Google sees the page as a duplicate of another page, and the page does not name a canonical. So Google chose the other page as its canonical, and will not show this page in search results.
- Google says this is not an error but works as intended, because it does not show duplicate pages. The URL Inspection tool shows you which URL it chose.
- It needs a fix in two cases only: Google chose a URL you do not want, or the page is not really a duplicate.

## Why it shows

The same content is reachable at more than one URL, and none of them names the canonical. Among the examples Google gives:

- Protocol variants: the `http` and `https` versions of a site.
- Device variants: a mobile and a desktop version of the same page.
- Region variants: the same content in the same language, at a separate URL for each country.
- Site functions: sorting and filtering a category page, or parameters added to the URL, such as `?gclid=`.
- Accidental variants: a demo copy of the site left open to crawlers.

## How to fix

If Google chose the URL you want, nothing is required: Google says a site will likely do just fine without declaring a canonical. If you want another URL, name it in a `<link rel="canonical">` tag on every version:

```html
<!-- On https://example.com/oud?gclid=ABCD and on https://example.com/oud itself -->
<link rel="canonical" href="https://example.com/oud">
```

- Put the tag in `<head>`, with a full URL, and add it to the canonical page itself as well. Link from your pages to the canonical URL, not to its copies.
- List only canonical URLs in your sitemap, and redirect permanently the copies you no longer need, such as the `http` version. Google counts redirects and canonical tags as strong signals and sitemaps as a weak one, and the signals are stronger combined.
- If the page is not really a duplicate, make its content differ substantially from the page Google chose.
- Do not use robots.txt, `noindex` or the URL removal tool to choose a canonical.

Then check the page with Arablyzer’s canonical checker: it confirms the page gives a single canonical URL, with no second tag or `Link` header that contradicts it.

## How to check the fix

- In the URL Inspection tool, the indexed result shows the canonical Google selected. The live test cannot show it, because Google determines it at indexing time.
- After you change the content, Google might keep the pages grouped as duplicates for up to two weeks. Request indexing only for your most important URLs, since requests are limited.

## FAQ

### Does Google penalize duplicate content?

Google says some duplicate content on a site is normal and does not violate its spam policies. But it shows only one version, which may not be the one you prefer.

### Must every page declare its canonical?

Google does not require it. If you declare one, put it on the canonical page itself as well, and use the same URL in every signal: do not name one URL in the sitemap and another in the tag.

### Are the Arabic and English versions of a page duplicates?

Only if their main content is in the same language. If the header, footer and other secondary text are translated while the body stays the same, Google treats them as duplicates.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Search Central: What is URL canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization)
- [Google Search Central: How to specify a canonical URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google Search Central: Fix canonicalization issues](https://developers.google.com/search/docs/crawling-indexing/canonicalization-troubleshooting)
- [Search Console Help: URL Inspection tool](https://support.google.com/webmasters/answer/9012289)
