---
reviewed: false
---

# URL parameters

URL parameters are name and value pairs after the question mark; some change what a page shows, some only track, and each combination is another address Google may crawl.

## Definition

- The query string is the part of a URL that starts at the first `?` and ends at a `#` or at the end of the URL (RFC 3986, section 3.4). Google recommends an `=` between name and value and an `&` to add further parameters, as in `https://example.com/category?category=dresses&sort=low-to-high&sid=789`.
- Some change what the page shows, such as filtering by `color` and `size`. Others do not: referral and tracking parameters such as `utm_source` and `gclid`, and session identifiers such as `sid` and `PHPSESSID`. Google's URL structure guide notes that referral parameters, shopping sort parameters and session IDs can create a large number of URLs.
- The part of a URL after `#` (the fragment) is not a parameter: Google says it generally does not support fragments in crawling and indexing, so they have no effect on crawling.
- Every different combination of names and values is a different URL, even when the page shows the same content.

## Why it matters

- Faceted navigation, meaning filtering and sorting through URL parameters, can in Google's words generate infinite URL spaces. A crawler cannot tell that a new URL is useless until it has crawled it, so it fetches a very large number of them, and has less time left for your new, useful pages.
- URLs that do not change the content make duplicates: Google's own example is a dress page URL carrying `?gclid=ABCD`. Google picks one URL to represent the copies, and is not obliged to pick the one you prefer.
- A session ID in a URL gives each visitor an address of their own. Google advises avoiding it where possible and using cookies instead.
- The URL parameters checker and the `url-parameters-links` rule read a page's links to its own site and report tracking and session parameters from their list. They leave alone parameters that change the content, such as `sort`, `page` and `color`.

## Example

Three links to the same page, each a different case:

- `https://shop.example/offers?utm_source=banner`: a tracking parameter; the content is the same.
- `https://shop.example/offers?PHPSESSID=7f3a9c1d`: a session ID; the content is the same.
- `https://shop.example/offers?sort=price`: a different ordering of the listing.

For the first two, remove the parameter from internal links, and give the page a canonical URL without parameters:

```html
<link rel="canonical" href="https://shop.example/offers">
```

Google treats a redirect and the `rel="canonical"` annotation as strong signals of the preferred URL, and listing it in a sitemap as a weak one. As for `sort=price`, if you do not need it to appear in Google Search, the first option Google's faceted navigation guide mentions is blocking its crawling in `robots.txt`.

## Common mistakes

- Tagging internal links with `utm_`: each is another address for the same page, and the `url-parameters-links` rule explains the effect on analytics. Keep `utm_` for email, ads and other sites' links.
- Putting the session ID in the URL instead of a cookie.
- Using `robots.txt` to consolidate duplicates: Google says not to, and that a blocked URL may still be indexed without its content.
- Separating parameters with commas, semicolons or brackets: Google says crawlers find those hard to recognise as separators, and recommends `&`.
- Treating `rel="canonical"` as a command: Google counts it as a signal, and may choose another URL.
- Treating all parameters alike: those that change the content, such as sorting and the page number, are a different decision from tracking.

## References

- [Google Search Central: URL structure best practices](https://developers.google.com/search/docs/crawling-indexing/url-structure)
- [Google Search Central: Managing crawling of faceted navigation URLs](https://developers.google.com/search/docs/crawling-indexing/crawling-managing-faceted-navigation)
- [Google Search Central: Consolidate duplicate URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [IETF: RFC 3986, the query component](https://www.rfc-editor.org/rfc/rfc3986#section-3.4)
