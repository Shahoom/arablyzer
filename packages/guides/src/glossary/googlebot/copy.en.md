# Googlebot

Googlebot is the generic name for the two crawlers Google Search reads web pages with: one simulates a user on a smartphone, the other a user on a desktop computer.

## Definition

- Googlebot is the generic name for two types of Google Search crawlers: Googlebot Smartphone and Googlebot Desktop. Both obey the same robots.txt token, `Googlebot`, so you cannot target one of them with a rule.
- For most sites Google primarily indexes the mobile version, so most requests come from the smartphone crawler. For Google Search, Googlebot reads the first 2MB of a file, uncompressed, and the first 64MB of a PDF; the rest is not indexed.

## Why it matters

- Blocking Googlebot affects all of Google Search, Discover included, as well as other products such as Google Images and Google News.
- Other crawlers often spoof Googlebot's `user-agent`, so verify a request before you block or allow it: with a reverse DNS lookup on its IP address, or against the IP ranges Google publishes.
- Google crawls mostly from US IP addresses, so a firewall or CDN that blocks visitors from outside your country may block Googlebot too. If Google detects this, it may try to crawl from other countries.

## Example

Checking that a request in the server logs came from Googlebot, with the example Google gives:

```text
$ host 66.249.66.1
1.66.249.66.in-addr.arpa domain name pointer crawl-66-249-66-1.googlebot.com.

$ host crawl-66-249-66-1.googlebot.com
crawl-66-249-66-1.googlebot.com has address 66.249.66.1
```

The name is in `googlebot.com` and resolves back to the same address, so the request is from Google. If either check fails, it is not, whatever its user agent says.

## Common mistakes

- Trusting the `user-agent` header alone: it is easy to spoof.
- Using `crawl-delay` to slow Googlebot down: Google does not support it. In an emergency, Google suggests answering `500`, `503` or `429`, but only for hours or a day or two, or URLs may drop out of the index.
- A mobile version with less content or fewer links than the desktop one: for most sites, Google indexes the mobile version.

## References

- [Google Search Central: Googlebot](https://developers.google.com/search/docs/crawling-indexing/googlebot)
- [Google: Verify requests from Google crawlers and fetchers](https://developers.google.com/crawling/docs/crawlers-fetchers/verify-google-requests)
- [Google: Overview of Google crawlers and fetchers](https://developers.google.com/crawling/docs/crawlers-fetchers/overview-google-crawlers)
- [Google: How Google interprets the robots.txt specification](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)
- [Google: Reduce the Google crawl rate](https://developers.google.com/crawling/docs/crawlers-fetchers/reduce-crawl-rate)
