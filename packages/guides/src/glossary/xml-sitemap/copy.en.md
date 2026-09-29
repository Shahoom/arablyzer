# XML sitemap

An XML sitemap is a file listing the URLs you want in search results, with details such as their last change, to help Google find and crawl them more efficiently.

## Definition

- A sitemap is a file where you give search engines information about your site's pages and files and the relationships between them, which they read to crawl the site more efficiently. XML is its most versatile format, defined by the sitemaps.org protocol.
- It has a `<url>` element for each URL, each with a required `<loc>` and an optional `<lastmod>` for the last modification date. A single file holds at most 50,000 URLs or 50MB uncompressed; beyond that, split it into files listed in a sitemap index.

## Why it matters

- It helps Google discover URLs, especially on a large site, or on a new one with few links from other sites. A small site of about 500 pages or fewer, with well-linked pages, may not need one.
- It is a hint, not an order: submitting it does not guarantee that Google crawls or indexes everything in it. Google ignores `<priority>` and `<changefreq>`, and uses `<lastmod>` if it is consistently accurate.
- On Arabic sites, the file is UTF-8, and every URL in it is percent-encoded and escaped as XML requires, so `&`, for example, becomes `&amp;`. A sitemap can also list each page's language versions, Arabic and English.

## Example

A sitemap with one page whose Arabic URL is percent-encoded:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <!-- https://example.com/عود/ -->
    <loc>https://example.com/%D8%B9%D9%88%D8%AF/</loc>
    <lastmod>2026-09-01</lastmod>
  </url>
</urlset>
```

Submit it in Search Console's Sitemaps report, or add a line such as `Sitemap: https://example.com/sitemap.xml` to robots.txt.

## Common mistakes

- Relative URLs such as `/oud/`: URLs must be absolute, starting with the protocol.
- URLs you do not want in results, such as pages with `noindex` or pages that redirect: list only canonical URLs.
- A `<lastmod>` set to the date the sitemap was generated rather than the date the page changed.
- An unescaped `&` in a URL, or a file in an encoding other than UTF-8.

## References

- [sitemaps.org: Sitemaps XML format](https://www.sitemaps.org/protocol.html)
- [Google Search Central: Learn about sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
- [Google Search Central: Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
