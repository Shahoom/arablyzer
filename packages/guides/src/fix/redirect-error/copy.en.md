# “Redirect error” in Search Console: what it means and how to fix it

What the Page indexing report means by “Redirect error”: a redirect chain too long, a loop or a bad URL, and how to make every old URL reach its page in one hop.

## What it means

- When Googlebot requested the URL, it redirected elsewhere, and Google could not follow the redirects to a final page, so the URL was not indexed.
- Google lists four cases of this error: a redirect chain that was too long, a redirect loop, a redirect URL that eventually exceeded the maximum URL length, and a bad or empty URL in the chain.
- A redirect in itself is not an error: a URL that redirects successfully to its page shows in the report under another message, “Page with redirect”.

## Why it shows

- A loop: URL `A` redirects to `B`, and `B` sends back to `A`, for example when two rules conflict, one adding `www` to the URL and another removing it. A loop can also be spread over several servers, such as a content delivery network (CDN) and the origin server, none of which sees the whole loop.
- A long chain: redirects that piled up with every move of the site, from `http` to `https`, then to `www`, then to a new path. Googlebot generally follows up to 10 redirect hops.
- A URL that grows with every hop: a rule that adds a part to the URL at each step, until it exceeds the maximum URL length.
- A bad or empty URL in the `Location` header, which holds the redirect’s destination.
- A server-side redirect that disagrees with another one in the page itself, a `<meta http-equiv="refresh">` tag or a JavaScript redirect, after one was changed and the other forgotten, which can create a loop between them.

## How to fix

Trace the chain from its start, to see every hop, its status code and its destination:

```bash
curl -sIL http://example.com/old-page | grep -iE '^(HTTP|location)'
```

- Make every old URL redirect straight to its final destination in one hop, instead of passing through several redirects.
- If you find a loop, keep the redirect rules in one place, or make them agree across the server, the CDN, and the content management system and its plugins.
- Use server-side redirects: `301` or `308` for a permanent move, `302` or `307` for a temporary one. Use a JavaScript redirect only when neither a server-side nor a `meta refresh` redirect is possible, because Google may never see it if rendering the page fails.
- Update internal links and the sitemap to point straight to the final URLs, so neither visitors nor Googlebot need a redirect at all.

## How to check the fix

- Run the same command on the old URL: you should see one redirect, then a `200` from the final page.
- For more details about the redirect, Google suggests a web debugging tool such as Lighthouse.
- In Search Console, open the URL Inspection tool and test the live URL. The live test follows redirects and tests the final URL without saying so, though, so it does not replace tracing the chain yourself.
- Then choose “Validate fix” in the Page indexing report, so Google checks the affected URLs again.

## FAQ

### How many redirects does Googlebot follow?

Googlebot generally follows up to 10 redirect hops when crawling web pages; it ignores the content of the redirecting URLs and processes the final URL’s content. Stay far from that limit, though: Google says long redirect chains have a negative effect on crawling, so make each redirect a single hop.

### What is the difference between this message and “Page with redirect”?

“Page with redirect” means the URL redirects successfully to another page: Google does not index it, and may index the target depending on what it thinks of it, which is normal when the redirect is intended. “Redirect error” means Google never reached a final page.

### Does the type of redirect matter: `301` or `302`?

Not for crawling: Google follows both. But `301` and `308` are a strong signal that the target is the canonical URL to show in results, while Google does not take `302` and `307` as that signal, and a temporary redirect keeps the source URL in results. Use a permanent redirect for a permanent move.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Search Central: Redirects and Google Search](https://developers.google.com/search/docs/crawling-indexing/301-redirects)
- [Google Crawling Infrastructure: How HTTP status codes affect Google’s crawlers](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)
- [Google Search Central: Troubleshoot Google Search crawling errors](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors)
- [MDN: Redirections in HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Redirections)
