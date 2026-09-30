# “URL blocked due to other 4xx issue” in Search Console: what it means and how to fix it

What the Page indexing report means by “URL blocked due to other 4xx issue”, how to find the code your server sent, and when it needs a fix.

## What it means

- When Google requested the URL, your server answered with a 4xx status code, a client error, that no other reason in the report covers: `401`, `403` and `404` have reasons of their own.
- Google does not index a URL that answers with a code in this class, and ignores any content sent with the response. If the URL was indexed before, Google removes it from the index.
- If you removed the page on purpose and it has no replacement, this answer can be the right one. The problem is a page you want in search that answers with it.

## Why it shows

The report does not name the code the server sent, and what the answer means depends on the code. Some of the codes MDN describes:

- `400 Bad Request`: the server cannot or will not process the request because of something it perceives as a client error, such as malformed request syntax.
- `414 URI Too Long`: the URL is longer than the server is willing to interpret.
- `451 Unavailable For Legal Reasons`: the page cannot legally be provided.

Google finds URLs in many ways, including links on pages and sitemaps, and tries to crawl most of them. It does not treat `429 Too Many Requests` like the rest of the class: it reads it as a sign that the server is overloaded, and handles it like a server error.

## How to fix

Start by finding the code: inspect the URL with the URL Inspection tool, as Google suggests, and look at the Crawl Stats report, in the property settings in Search Console: it groups Google’s requests by response, and shows the response code of example URLs. Then:

- If you want the page in search, make its URL answer with `200` and the page’s content: find the rule that sends the error code, in the server’s settings, a plugin or the content delivery network (CDN), and remove it or narrow it.
- If you moved the page to a new URL, redirect the old one to it permanently, with `301`.
- If you removed the page for good, an error answer is right, and it is best as `404` or `410`: Google recommends either for pages removed permanently. Remove the URL from your sitemap and from the links on your pages.

## How to check the fix

- In Search Console, open the URL Inspection tool and test the live URL, to see whether Google can fetch the page now.
- Then request indexing from the same tool, and choose “Validate fix” in the Page indexing report. Google says validation typically takes up to about two weeks, and longer in some cases.
- A page you removed on purpose needs no validation: Google keeps requesting its URL for a while, less and less often.

## FAQ

### Why does Google keep requesting a URL that answers with a 4xx error?

Google keeps crawling the URLs it knows for a while after they return an error in this class, in case the error is temporary, and crawls them less and less often. Google says there is no way to tell it to forget a URL permanently.

### Is 410 better than 404 for a removed page?

Not for Google: it treats every 4xx code the same way except `429`, and recommends either code for a page removed permanently.

### Do 4xx errors slow down the crawling of my site?

No. Google says 4xx codes, except `429`, have no effect on its crawl rate. A `429` makes Google’s crawlers slow down temporarily, as `5xx` server errors do.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Search Console Help: URL Inspection tool](https://support.google.com/webmasters/answer/9012289)
- [Search Console Help: Crawl Stats report](https://support.google.com/webmasters/answer/9679690)
- [Google Crawling Infrastructure: How HTTP status codes affect Google’s crawlers](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)
- [Google Crawling Infrastructure: Optimize your crawl budget](https://developers.google.com/crawling/docs/crawl-budget)
- [MDN: HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status)
