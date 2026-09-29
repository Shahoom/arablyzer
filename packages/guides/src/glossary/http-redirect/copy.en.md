# HTTP redirect

A redirect is a server response with a 3xx status code and a new URL that sends visitors and crawlers elsewhere. Its type decides which of the two URLs Google shows.

## Definition

- A server redirects with a response whose status code starts with 3, and a `Location` header holding the new URL, which the browser loads at once.
- Permanent redirects (`301`, `308`) tell Google the target should be canonical, so it shows the target in results. Temporary ones (`302`, `303`, `307`) are followed but not used as a canonical signal, so the source usually stays in results.
- `307` and `308` keep the request method, so a `POST` stays a `POST`. Pages can also redirect with `meta refresh` or JavaScript, which Google advises only when nothing else works.

## Why it matters

- A permanent redirect takes visitors and old links to a page's new address and tells Google which address to show; it is also how a site settles on one address, such as `http` to `https`.
- Long chains hurt crawling. Google's crawlers follow up to 10 redirect hops, and Search Console reports a chain that is too long, or a loop, as "Redirect error".
- On sites in Arabic and English, Google advises against redirecting visitors automatically to the language you guess is theirs: people and search engines may never see every version. Link the versions instead.

## Example

A store moved a page from `https://example.com/عود` to `https://example.com/ar/oud`, so the old URL answers with a permanent redirect:

```http
HTTP/1.1 301 Moved Permanently
Location: https://example.com/ar/oud
```

Google shows the new URL in results, and may sometimes show the old one as an alternate name when a searcher's query hints that they trust it more.

## Common mistakes

- A temporary `302` for a permanent move. In Apache, for example, the `Redirect` directive without `permanent` gives a `302`.
- A chain such as `http` to `https` to `www` to a trailing slash, instead of one redirect to the final URL.
- Redirecting a removed page to one that is nothing like it: if it has no clear replacement, the right answer is `404` or `410`.

## References

- [Google Search Central: Redirects and Google Search](https://developers.google.com/search/docs/crawling-indexing/301-redirects)
- [Google: How HTTP status codes affect Google's crawlers](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)
- [MDN: Redirections in HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Redirections)
- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Search Central: Troubleshoot Google Search crawling errors](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors)
- [Google Search Central: Managing multi-regional and multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
