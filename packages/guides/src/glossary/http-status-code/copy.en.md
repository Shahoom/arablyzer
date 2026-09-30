# HTTP status code

An HTTP status code is the three-digit number a server sends with every response, saying whether the request succeeded, was redirected or failed. Google acts on it.

## Definition

- A status code is a three-digit integer that describes the result of a request, from 100 to 599. The first digit gives the class: `1xx` informational, `2xx` successful, `3xx` redirection, `4xx` client error and `5xx` server error.
- The phrase after the code, such as `Not Found`, is only a recommendation: the meaning is in the number.

## Why it matters

What Google does with the most common codes:

| Code | Meaning | What Google does |
| --- | --- | --- |
| `200` | Success | Passes the content on to indexing, with no guarantee |
| `301`, `308` | Moved permanently | Follows it, as a strong signal |
| `302`, `307` | Moved temporarily | Follows it, as a weak signal |
| `404`, `410` | Not found, gone | Does not index the URL, and drops it if indexed |
| `429` | Too many requests | Treats it as a server error and slows crawling |
| `500`, `503` | Server error | Slows crawling, and drops URLs whose error persists |

All `4xx` codes except `429` are the same to Google, so `404` and `410` have the same effect, and none of them changes the crawl rate.

## Example

Checking the code of a Ramadan offer page that ended for good, with `curl`:

```text
$ curl -I https://example.com/ar/offers/ramadan-2025
HTTP/2 410
content-type: text/html; charset=utf-8
```

`410` says the page was removed on purpose, as is common for limited-time offers; `404` fits when you do not know if it is gone for good.

## Common mistakes

- A "not found" page that answers `200`: Google treats it as a soft 404 and does not index it.
- Answering `401` or `403` to slow crawling down: they have no effect on it.
- Answering `503` for days: Google suggests it to slow crawling for hours or a day or two only, as URLs may drop out of the index.
- A firewall or CDN that answers Googlebot with `403` while visitors see the page: Googlebot never sends credentials, and the page is not indexed.

## References

- [RFC 9110: HTTP Semantics, Status Codes](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes)
- [Google: How HTTP status codes affect Google's crawlers](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)
- [Google: Reduce the Google crawl rate](https://developers.google.com/crawling/docs/crawlers-fetchers/reduce-crawl-rate)
- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
