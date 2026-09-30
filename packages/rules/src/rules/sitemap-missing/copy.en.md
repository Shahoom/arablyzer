# No sitemap for search engines to find

## Messages

### none

robots.txt names no sitemap as a full URL, and {url} answered HTTP {status}.

### html

robots.txt names no sitemap as a full URL, and {url} answers with an HTML page, not a sitemap.

## Why it matters

- A sitemap is a file that tells search engines which pages of your site you think are important, and can say when each was last updated and which pages are its versions in other languages. Search engines like Google read it to crawl a site more efficiently.
- When a site's pages are properly linked, Google can usually discover most of them without one, and a sitemap does not guarantee that every page in it is crawled and indexed. Even so, Google says that in most cases a site benefits from having one.
- It helps most where links do not reach every page: a large site, a new site with few links from other sites, or one with a lot of video and images, or shown in Google News. A small site, about 500 pages or fewer, whose important pages can all be reached by links from the home page, may not need one.

## How to fix

- If you use a content management system such as WordPress, Wix or Blogger, it has likely made a sitemap already: find where.
- Name the sitemap in robots.txt, with its full URL. You can name more than one, and Google finds them the next time it crawls robots.txt:

```text
Sitemap: https://www.example.com/sitemap.xml
```

- Without a sitemap, write one. The simplest is a text file, its name ending in `.txt`, with one full URL on each line. An XML sitemap lists each page in a `<url>` element, and can say more about it:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/ar/</loc>
  </url>
  <url>
    <loc>https://www.example.com/en/</loc>
  </url>
</urlset>
```

- Either way, the file is encoded in UTF-8, and its URLs are full ones.
- A page your server answers every address with, `/sitemap.xml` among them, is not a sitemap: answer addresses you do not have with `404`.

## How we detect

1. We read the site's robots.txt, as `ArablyzerBot`, and its `Sitemap:` lines. A line counts when it gives a full URL, with its protocol (`https://` or `http://`) and host, as Google asks.
2. When robots.txt names none, we ask for `/sitemap.xml` at the root of the page's site, where the sitemaps protocol recommends placing a sitemap. The rule fails when that address answers with an error status, such as `404` or `410`, or with an HTML page rather than a sitemap.
3. Whether a sitemap can be read, and is in a format search engines read, is checked by another rule, `sitemap-invalid`.
4. The rule applies to public sites alone: search engines do not reach a local development address.
5. When robots.txt or `/sitemap.xml` cannot be read for a reason other than the site's answer, such as a failed connection or an address the scan does not reach, the rule says it could not check, and does not fail. So it does when the site turns the scan away or cannot answer, with `401`, `403`, `407`, `429` or a server error (`5xx`): it has not said there is no sitemap.

## References

- [Google Search Central: Learn about sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
- [Google Search Central: Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: How Google interprets the robots.txt specification](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)
- [sitemaps.org: the sitemaps protocol](https://www.sitemaps.org/protocol.html)
