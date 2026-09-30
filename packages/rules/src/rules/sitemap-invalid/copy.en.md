# A sitemap search engines cannot read

## Messages

### not-url

robots.txt names “{value}” as a sitemap, on line {line}, but a sitemap's address must be a full URL, with its protocol and host.

### unavailable

robots.txt names {url} as a sitemap, but it answered HTTP {status}.

### html

robots.txt names {url} as a sitemap, but it answers with an HTML page.

### not-xml

{url} is not well-formed XML: its first error is on line {line}.

### root

{url} is XML, but its root element is <{root}>: a sitemap's is <urlset>, an index's <sitemapindex>, and a feed's <rss> (RSS 2.0) or <feed> (Atom 1.0).

### namespace

The <{root}> element of {url} is not in the sitemaps protocol's namespace, http://www.sitemaps.org/schemas/sitemap/0.9.

### text

{url} is not XML, and its line {line} is not a full URL, as every line of a text sitemap must be.

### empty

{url} lists no URL.

## Why it matters

- Search engines read a sitemap to find a site's pages. When Google cannot fetch a sitemap or parse it, it tries again for a few days and then stops; when it can fetch one with errors, it queues for crawling only the URLs it could parse without errors.
- A Sitemap line of robots.txt must give a full URL, including its protocol and host, as Google's robots.txt specification says: a path alone, such as `/sitemap.xml`, is not one.
- Google reads sitemaps in the protocol's XML, as RSS 2.0 or Atom 1.0 feeds, and as text with one URL on each line. An XML sitemap's root element is `urlset`, and a sitemap index's `sitemapindex`, both in the namespace `http://www.sitemaps.org/schemas/sitemap/0.9`, written exactly: Search Console reports another as an incorrect namespace.
- As in all XML, characters such as `&` in a URL must be escaped. Google says an unescaped character in a URL is often what stops it from parsing a sitemap.

## How to fix

- Give each Sitemap line of robots.txt the sitemap's full URL:

```text
Sitemap: https://www.example.com/sitemap.xml
```

- Open that address yourself: it should answer with the sitemap, not an error or an HTML page. If it does not, fix the address in robots.txt, or put the sitemap there.
- Start an XML sitemap with the protocol's root element and namespace, and write each `&` in a URL as `&amp;`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/ar/offers?page=2&amp;sort=new</loc>
  </url>
</urlset>
```

- The other characters XML escapes are `'` as `&apos;`, `"` as `&quot;`, `>` as `&gt;` and `<` as `&lt;`.
- A text sitemap has one full URL on each line, and nothing else.

## How we detect

1. We read each Sitemap line of robots.txt. A value that is not a full `https://` or `http://` URL fails at once.
2. We fetch the first 3 sitemaps robots.txt names as full URLs, or `/sitemap.xml` when it names none, as `ArablyzerBot`, following redirects. We read up to `25 MB` of each, decompressing a file that is itself gzipped, within ten seconds for them all. We do not fetch the sitemaps an index lists, nor the ones robots.txt names past the third.
3. A sitemap robots.txt names fails when it answers with an error status, such as `404` or `410`, or an HTML page. When robots.txt names none, an error or an HTML page at `/sitemap.xml` means there is no sitemap there, which the rule `sitemap-missing` reports; a sitemap there is judged as the others are.
4. XML must be well-formed, with XML's own entities alone and one root element, and its root must be `urlset` or `sitemapindex` in the protocol's namespace, or an RSS 2.0 or Atom 1.0 feed. A byte order mark and white space before the XML are allowed, as Search Console allows them. Anything that is not XML is read as a text sitemap: each line that is not blank must be a full URL.
5. A `urlset`, a `sitemapindex` or a text sitemap that lists nothing fails too. A sitemap past `25 MB` is judged in its first `25 MB`; the protocol allows `50 MB`.
6. We do not check the URLs a sitemap lists, nor its dates.
7. When a sitemap cannot be read for a reason other than the site's answer, such as a failed connection, an address the scan does not reach, or a robots.txt that asks `ArablyzerBot` not to fetch it, the rule says it could not check, and does not fail. So it does when the site turns the scan away or cannot answer, with `401`, `403`, `407`, `429` or a server error (`5xx`), as RFC 9309 has a crawler treat a robots.txt that answers so: the site has not said the sitemap is missing.

## References

- [Google Search Central: Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google Search Central: Manage your sitemaps with a sitemap index file](https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps)
- [Search Console Help: Sitemaps report](https://support.google.com/webmasters/answer/7451001)
- [Google: How Google interprets the robots.txt specification](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)
- [sitemaps.org: the sitemaps protocol](https://www.sitemaps.org/protocol.html)
