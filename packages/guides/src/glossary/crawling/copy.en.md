# Crawling

Crawling is how search engine programs visit web pages and download their content to learn what is on them: the first step before a page can show in results.

## Definition

- Crawling is the first stage of Google Search: automated programs called crawlers, Googlebot in Google's case, download the text, images and videos of pages found on the web.
- Google finds URLs in pages it already knows and in the sitemaps you submit, then renders each page and runs its JavaScript with a recent version of Chrome.

## Why it matters

- Google cannot index the content of a page it has not crawled. The usual obstacles are server problems, network issues and robots.txt rules.
- Crawling is not indexing: a page Google crawled may stay out of the index, and a URL you blocked from crawling may still be indexed if other pages link to it.
- On sites in Arabic and English, Google recommends a separate URL for each language version, with a visible link between them, rather than one URL whose language changes with cookies or browser settings.

## Example

A new product page that Googlebot reaches from the category page:

```html
<!-- On https://example.com/ar/oud/, a link to /ar/عود-كمبودي, percent-encoded -->
<a href="/ar/%D8%B9%D9%88%D8%AF-%D9%83%D9%85%D8%A8%D9%88%D8%AF%D9%8A">عود كمبودي</a>
```

Googlebot finds the URL in the `href`, reads robots.txt, then fetches and renders the page and queues the links it finds there.

## Common mistakes

- Links without an `href`, such as a button with an `onclick` handler alone: Google may not extract a URL from them.
- Raw Arabic letters in `href`: Google recommends percent-encoding characters outside the ASCII range.
- Redirecting visitors by IP address or browser language: Googlebot usually crawls from the US without an `Accept-Language` header, so it may only ever see one version.

## References

- [Google Search Central: In-depth guide to how Google Search works](https://developers.google.com/search/docs/fundamentals/how-search-works)
- [Google Search Central: Understand the JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google Search Central: Link best practices for Google](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Google Search Central: URL structure best practices for Google Search](https://developers.google.com/search/docs/crawling-indexing/url-structure)
- [Google Search Central: Managing multi-regional and multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Google Search Central: Introduction to robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
