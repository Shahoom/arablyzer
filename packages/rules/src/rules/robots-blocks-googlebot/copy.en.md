# robots.txt blocks Googlebot from the page

## Messages

### disallowed

robots.txt blocks Googlebot from this page with "{rule}" on line {line}.

### server-error

robots.txt answered HTTP {status}, which Google temporarily treats as blocking the whole site.

### unreachable

robots.txt could not be reached, and crawlers that follow RFC 9309, Google among them, treat that as blocking the whole site.

## Why it matters

- Googlebot is the crawler Google uses to read your pages before showing them in search results. When robots.txt blocks it from a page, Google cannot read the page's content; the page may appear as a bare link without a description, or not at all.
- A single line such as `Disallow: /` blocks the whole site, and it is often left over from the development version after launch.
- When robots.txt answers with a server error (5xx) or 429, Google temporarily stops crawling the whole site until it can read the file again.
- robots.txt is not a way to hide a page from search results; use `noindex` for that and leave the page open to crawling.

## How to fix

Remove the blocking rule, or narrow it to what you really want to block:

```text
# Before: blocks the whole site
User-agent: *
Disallow: /

# After: blocks only the admin area
User-agent: *
Disallow: /admin/
```

- Make sure `/robots.txt` answers 200, or 404 if you do not need one, and never a 5xx error.
- After the change, check the robots.txt report in Google Search Console.

## How we detect

1. We fetch `/robots.txt` from the origin of the final URL after redirects, following up to 5 redirects and reading the first 500 KiB, as Google does.
2. We parse it as RFC 9309 describes, with the tolerance Google documents, such as common misspellings of field names and a missing colon.
3. We pick the Googlebot group, or the `*` group when there is none for Googlebot, merge groups with the same name, and apply the longest matching rule; on a tie, `Allow` wins. `*` and `$` are supported.
4. A 5xx or 429 answer, or a failed connection, means the whole site is blocked. A 4xx answer, such as 404, means no restrictions.

We fetch robots.txt as ArablyzerBot, not as Googlebot; if your server or firewall answers Googlebot differently, the result reflects what we received.

## References

- [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html)
- [Google: How Google interprets the robots.txt specification](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)
- [Google: Introduction to robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
