# “Blocked due to access forbidden (403)” in Search Console: what it means and how to fix it

What “Blocked due to access forbidden (403)” means: your server refuses Googlebot’s requests, and how to find what blocks it and let it in after verifying it.

## What it means

- When Googlebot requested the page, the server answered `403 Forbidden`: it understood the request and refused it, so Google did not reach the page and will not index it.
- Google says `403` means the user agent provided credentials but was not granted access, and Googlebot never provides credentials, so your server is returning this error incorrectly.
- If you want the page in search, the fix is to let visitors reach it without logging in, or to explicitly allow Googlebot’s requests after verifying its identity.

## Why it shows

The server answers `403` when it refuses the request for a reason of its own, and logging in makes no difference. Common causes:

- A firewall or DoS protection system blocking Googlebot: Google says these systems can block it because it makes more requests than a human visitor.
- A security plugin or a server rule that blocks crawlers by name or by IP address.
- Blocking visitors from outside certain countries, while Googlebot’s default IP addresses appear to be in the US.
- Permissions on the server that deny access to the file or folder.

## How to fix

- Look in your server logs for the Googlebot requests the server answered with `403`, and find the layer that answered: the content delivery network (CDN), the firewall, the server, or a plugin in the content management system.
- Allow Googlebot in that layer, but after verifying its identity, not by its name alone, since anyone can call themselves Googlebot.
- If the firewall is not under your control, talk to your host.

To verify a request that claims to come from Googlebot, look up the domain name of the IP address in your logs, check that it is in `googlebot.com`, `google.com` or `googleusercontent.com`, then look up the IP address of that name and check that it is the same address, as in Google’s example:

```bash
host 66.249.66.1
# 1.66.249.66.in-addr.arpa domain name pointer crawl-66-249-66-1.googlebot.com.

host crawl-66-249-66-1.googlebot.com
# crawl-66-249-66-1.googlebot.com has address 66.249.66.1
```

For firewall rules, you can also match addresses against the IP ranges Google publishes for its crawlers.

## How to check the fix

- Watch the Googlebot requests in your server logs after the change: the server should answer them with `200`.
- In Search Console, open the URL Inspection tool and test the live URL.
- Then request indexing from the same tool, and choose “Validate fix” in the Page indexing report.

## FAQ

### Why does Google say my server returns `403` incorrectly?

Because `403` means the visitor provided credentials that were refused, and Googlebot never provides credentials. If the page really requires a login, the fitting code is `401`, which means the request lacks valid credentials; if the page is public, there is no reason to refuse Googlebot.

### Should I use `403` to slow down Google’s crawling?

No. Google says not to use `401` or `403` to limit the crawl rate, because `4xx` codes other than `429` have no effect on it, and a page that answers with them drops out of the index. If you need to reduce crawling in an emergency, answer `500`, `503` or `429` temporarily, for a few hours or a day or two, no longer.

### My site blocks visitors from outside the Gulf. Does that affect Googlebot?

Most likely. Google says its crawler’s default IP addresses appear to be in the US, that it also crawls from addresses outside the US, and it recommends treating Googlebot like any visitor from the country it appears to come from. So if you answer `403` to visitors from the US, you answer it to Googlebot when it crawls from its default addresses.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Crawling Infrastructure: Verify requests from Google crawlers and fetchers](https://developers.google.com/crawling/docs/crawlers-fetchers/verify-google-requests)
- [Google Crawling Infrastructure: How HTTP status codes affect Google’s crawlers](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)
- [Google Crawling Infrastructure: Reduce the Google crawl rate](https://developers.google.com/crawling/docs/crawlers-fetchers/reduce-crawl-rate)
- [Google Search Central: How Google crawls locale-adaptive pages](https://developers.google.com/search/docs/specialty/international/locale-adaptive-pages)
- [MDN: 403 Forbidden](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/403)
