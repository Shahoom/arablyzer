# robots.txt

robots.txt is a text file at a site's root that tells crawlers which paths to visit and which to skip. It manages crawling; it does not hide pages from search.

## Definition

- A text file named `robots.txt` in the top-level directory of a site, such as `https://example.com/robots.txt`, following the Robots Exclusion Protocol, which became a standard as RFC 9309 in 2022.
- It is made of groups: one or more `User-agent` lines naming crawlers, then `Disallow` and `Allow` rules for paths. A crawler follows the group with its name, or else the `*` group, and the longest matching rule wins.
- It applies only to the host, protocol and port it is served from: `https://example.com/robots.txt` does not cover `https://shop.example.com/` or `http://example.com/`.

## Why it matters

- It is used mainly to keep crawlers from overloading the site, not to hide pages: Google may index a blocked URL if other pages link to it, and show it in results without a description.
- Its rules are not protection: respectable crawlers follow them, others may not, and every path you list becomes known to anyone who reads the file.
- On Arabic sites, save the file as UTF-8, or Google may ignore characters outside it and the rule breaks. Each subdomain, such as `ar.example.com` and `en.example.com`, needs its own file.

## Example

A store's file that blocks the cart and internal search results, and points to the sitemap:

```text
# https://example.com/robots.txt
User-agent: *
Disallow: /cart/
Disallow: /بحث/

Sitemap: https://example.com/sitemap.xml
```

Google compares rules with URLs in their percent-encoded form, so it treats `Disallow: /بحث/` the same as `Disallow: /%D8%A8%D8%AD%D8%AB/`.

## Common mistakes

- `Disallow: /` in the `*` group, left over from the development site, blocking the whole site.
- Blocking a page that has `noindex` in robots.txt: Google never sees the rule, and the URL may stay in results.
- Writing `noindex` or `crawl-delay` in the file: Google supports neither.
- Answering the request for the file with a `5xx` error: Google stops crawling the whole site for the first 12 hours.

## References

- [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html)
- [Google Search Central: Introduction to robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
- [Google: How Google interprets the robots.txt specification](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)
- [Google Search Central: Block Search indexing with noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
