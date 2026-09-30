---
summary: Does your site give search engines a sitemap they can read?
---

# Sitemap checker

Finds your site's sitemap, named in robots.txt or at /sitemap.xml, and checks that search engines can fetch it and read it: XML in the sitemaps protocol's format, a feed, or a list of URLs.

## What it checks

- Whether robots.txt names a sitemap with a `Sitemap:` line, and whether that line gives a full URL, with its protocol and host.
- When robots.txt names none, whether there is a sitemap at `/sitemap.xml`, rather than an error or an HTML page.
- Whether each sitemap found answers, and is well-formed XML whose root is `urlset` or `sitemapindex` in the namespace `http://www.sitemaps.org/schemas/sitemap/0.9`, an RSS 2.0 or Atom 1.0 feed, or text with one full URL on each line.
- Whether each sitemap lists at least one URL.

## Example

### Wrong

```robots.txt
User-agent: *
Disallow: /cart/
```

### Right

```robots.txt
User-agent: *
Disallow: /cart/

Sitemap: https://www.example.com/sitemap.xml
```

## How to fix

- If you use a content management system such as WordPress, Wix or Blogger, it has likely made a sitemap already: find its address, and name it in robots.txt with its full URL. Google finds a sitemap named there the next time it crawls robots.txt.
- Without one, write one. The simplest is a text file, its name ending in `.txt`, with one full URL on each line. An XML sitemap starts like this, with each `&` in a URL written as `&amp;`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/ar/</loc>
  </url>
</urlset>
```

- Keep each sitemap to 50,000 URLs and `50 MB` uncompressed at most. A larger one must be split, and a sitemap index can list the parts.
- Open your sitemap's address yourself: it should answer with the sitemap, not an error or an HTML page.

## FAQ

### Do I need a sitemap?

Google says a sitemap helps search engines discover a site's URLs, though it does not guarantee that each one is crawled and indexed, and that in most cases a site benefits from one. A small site, about 500 pages or fewer, whose important pages can all be reached by links from the home page, may not need one; a large or new site, or one with a lot of video and images, may.

### Why does the check look at `/sitemap.xml`?

It is the address the sitemaps protocol gives, in its example, for a sitemap at the root of a site, and a site may have submitted a sitemap there in Search Console, which the check cannot see. Google documents the ways to make a sitemap available to it: the Sitemaps report in Search Console, the Search Console API, a `Sitemap:` line in robots.txt, and, for an RSS or Atom feed, WebSub.

### Does the check read every URL in my sitemap?

No. It reads the first 3 sitemaps robots.txt names, or `/sitemap.xml`, up to `25 MB` of each, and judges their format. It does not follow the sitemaps an index lists, nor check the pages a sitemap lists or their dates. Search Console's Sitemaps report shows the errors Google found in the sitemaps you submit there.

### My sitemap is gzipped. Does that count?

Yes. The sitemaps protocol allows a sitemap compressed with gzip, as long as it is no larger than `50 MB` once uncompressed, and the check decompresses it before reading it.

## Methodology

We fetch the site's robots.txt as `ArablyzerBot` and read its `Sitemap:` lines; a line counts when its value is a full `https://` or `http://` URL. We fetch the first 3 sitemaps it names this way, or `/sitemap.xml` at the site's root when it names none, following redirects and reading each site's robots.txt before fetching from it, up to `25 MB` of each, decompressing a gzipped file, within ten seconds for them all. A sitemap is judged in the formats Google reads: XML must be well-formed, its root `urlset` or `sitemapindex` in the protocol's namespace, or an RSS 2.0 or Atom 1.0 feed; anything else is read as text, a full URL on each line that is not blank. A sitemap that cannot be read for a reason other than the site's answer, such as a failed connection, or that the site turns the scan away from (`401`, `403`, `407`, `429`) or cannot answer (a server error), is reported as unchecked, not as a fault. The check applies to public sites alone.
