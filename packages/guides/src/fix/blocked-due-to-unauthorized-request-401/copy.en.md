# “Blocked due to unauthorized request (401)” in Search Console: what it means and how to fix it

What “Blocked due to unauthorized request (401)” means: the page asks for a login, so Googlebot cannot reach it, and how to open it when you want it in search.

## What it means

- When Googlebot requested the page, the server answered `401 Unauthorized`: the page asks for credentials, and Googlebot never sends credentials, so it did not reach the content and did not index it.
- If the page is private, such as a customer account or an admin area, this is what you want: requiring a login is one of the ways Google names to keep a page out of search results.
- The problem is the message on public pages you want in search.

## Why it shows

The server answers `401` when it wants valid credentials it did not get, and sends with it a `WWW-Authenticate` header that says which way to log in:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Basic realm="staging"
```

Common causes:

- A staging copy or a site under construction behind a password, whose URLs appeared in public pages or in the sitemap.
- Password protection on a folder or the whole site, set in the hosting panel and left on after launch.
- Members-only pages, such as orders or the account, linked from public pages.

## How to fix

First decide: do you want the page in search results?

- If it is public: remove the login requirement from it in the server, hosting or content management system settings, so it answers `200` to any visitor.
- If it is private: keep the `401`, and remove it from the sitemap and from the links in your public pages. You can also block crawling it in robots.txt.
- If you want Google to index it while it stays closed to visitors: Google mentions letting Googlebot in after verifying its identity, but warns that Googlebot can be spoofed, so letting it in effectively removes the page’s protection. Only do it for pages without confidential data.

## How to check the fix

- Open the page in a private (incognito) window, without logging in: if it asks you for credentials, that is what Googlebot gets.
- Request the page with `curl -I`, and make sure it answers `200`.
- In Search Console, open the URL Inspection tool and test the live URL; the test must reach the page from the internet without any login.
- Then request indexing from the same tool, and choose “Validate fix” in the Page indexing report.

## FAQ

### What is the difference between `401` and `403`?

`401` means the request lacks valid credentials, and the server sends with it the way to log in. `403` means the server understood the request and refused it, and logging in makes no difference. Because Googlebot never sends credentials, Google says a server that answers it with `403` is returning that error incorrectly.

### Will the page drop out of the index if it was indexed before?

Yes, over time: Google does not index URLs that answer with a `4xx` error, removes the ones already indexed from the index, and gradually crawls them less.

### How do I make sure a visitor calling itself Googlebot is really Googlebot?

The name Googlebot in the request is not enough, since anyone can spoof it. Take the IP address from your server logs, look up the domain name it points to (a reverse DNS lookup), and check that it is in `googlebot.com`, `google.com` or `googleusercontent.com`; then look up the IP address of that name and check that it is the same address. Or match the address against the IP ranges Google publishes for its crawlers.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Search Console Help: Crawl Stats report](https://support.google.com/webmasters/answer/9679690)
- [Search Console Help: URL Inspection tool](https://support.google.com/webmasters/answer/9012289)
- [Google Crawling Infrastructure: Verify requests from Google crawlers and fetchers](https://developers.google.com/crawling/docs/crawlers-fetchers/verify-google-requests)
- [Google Crawling Infrastructure: How HTTP status codes affect Google’s crawlers](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)
- [MDN: 401 Unauthorized](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/401)
