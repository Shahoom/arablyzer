# “Server error (5xx)” in Search Console: what it means and how to fix it

What the Page indexing report means by “Server error (5xx)”, why your server answers Google with an error, and how to fix the cause before your pages drop out of the index.

## What it means

- When Googlebot requested the page, the server answered with a `5xx` error, such as `500`, `502` or `503`, so Google got no content to index, and it ignores any content sent with that response.
- The error is on your server’s side, not in the page’s content, and Google cannot get the content as long as the server answers with this error.
- Google does not drop indexed pages at the first error: it temporarily slows down crawling the site and keeps its indexed URLs, but it drops from the index the URLs that keep returning a server error.

## Why it shows

Each code in this class points to where the problem is:

- `500`: a generic error in the server or the site’s application, such as a wrong configuration, running out of memory, an exception the code did not handle, or wrong file permissions.
- `502` and `504`: a server in the middle, such as a content delivery network (CDN) or a proxy, got no valid response from the origin server, or got none in time.
- `503`: the server is not ready right now, because of maintenance or overload.

Common causes:

- A hosting server that is down, overloaded or misconfigured.
- Dynamic pages reached through URLs with many parameters, which take so long to respond that the request times out; Google recommends short parameter lists.
- A firewall or DoS protection system blocking Googlebot: Google says these systems can block it because it makes more requests than a human visitor.

## How to fix

Start with your server logs: find the Googlebot requests the server answered with `5xx`, and look at what failed at those times.

- Check the host status in Search Console’s Crawl Stats report: it shows whether and when Google had trouble reaching your site.
- Fix the cause itself, in the server configuration or the application code. For a `502` or `504`, look at the origin server behind the server in the middle.
- If the server cannot handle the traffic, talk to your host and increase its capacity.
- If a firewall blocks Googlebot, find the part that blocks it and remove the block; if the firewall is not under your control, talk to your host.

For planned maintenance, answer `503` with a `Retry-After` header, which gives the expected length of the outage, in seconds or as a date. Do not answer `404`, because Google drops URLs that return `4xx` from the index, nor a maintenance page with `200`, because Google takes it as the page’s content:

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 120
```

## How to check the fix

- Request the page yourself and make sure the server answers `200`, for example with `curl -I` followed by the page’s URL.
- In Search Console, open the URL Inspection tool and test the live URL. Server errors can be transient, though: the live test can pass at a time Google’s crawl failed.
- Watch the responses table in the Crawl Stats report to make sure new `5xx` responses have stopped.
- Then choose “Validate fix” in the Page indexing report. Google says validation typically takes up to about two weeks, and can take much longer in some cases.

## FAQ

### Will Google drop my pages from the index because of a `5xx` error?

Not at the first one. When Google gets `5xx` responses, it temporarily slows down crawling the site and keeps indexed URLs in the index, but it eventually drops the URLs that keep returning a server error. Once the server answers `2xx` again, Google gradually increases crawling.

### How long can the site answer `503` during maintenance?

Only briefly: Google says Googlebot retries URLs that answer `503` or `429` for about 2 days, and that answering with them for more than 2 days makes it drop those URLs from the index.

### Why does the live test pass while the report still shows the error?

For one of two reasons: server errors can be transient, so your test can pass at a time Google’s crawl failed; or you fixed the error after the last crawl. Compare the last crawl date in the URL Inspection tool with the date of your fix. If the error keeps happening to Googlebot alone, look for a firewall blocking it.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Crawling Infrastructure: How HTTP status codes affect Google’s crawlers](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)
- [Google Search Central: Troubleshoot Google Search crawling errors](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors)
- [MDN: 500 Internal Server Error](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/500)
- [RFC 9110: Server Error 5xx](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6)
