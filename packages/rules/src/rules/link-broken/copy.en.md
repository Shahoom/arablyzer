# Broken links to the site's own pages

## Messages

### broken

The link to {url} answers {status}, an error: whoever follows it reaches an error page instead of the page they wanted.

## Why it matters

- A visitor who follows a broken link reaches an error page, without what the link promised, and may leave.
- Google relies on links to judge how pages relate and to find new pages to crawl. A link that leads to an error leads nowhere.
- Google does not index addresses that answer a `4xx` status code. A `5xx` error asks Google's crawlers to slow their crawling for a while.

## How to fix

Correct the address in the link, or restore the page it leads to. If the page has moved to a new address, send its old address there with a permanent redirect, so every old link to it works:

```nginx
location = /ar/ofers/ {
    return 301 /ar/offers/;
}
```

- Remove links to pages that are gone for good.
- If the error is a `5xx`, the fault is in the server: look for it in its error logs.
- In Apache (mod_alias): `Redirect permanent /ar/ofers/ /ar/offers/`.

## How we detect

1. We read the `<a href>` and `<area href>` links in the page's HTML as the server sends it, before JavaScript runs, completed against the page's base address. We check those that lead to the page's own origin, that is the same scheme, name and port: links to other sites, or to another name of the same domain such as `www`, are not checked. Each address is checked once, without what follows `#`; the page itself, and addresses with a user name or password, are left out.
2. We never ask for a link in a path that a group naming `ArablyzerBot` in robots.txt disallows, as we ask for no page it disallows.
3. We check the first 50 links, four at a time, within 20 seconds in all and 10 seconds each. The report says how many links were not checked.
4. We ask for each link with `HEAD`; when it answers a `4xx` or `5xx` error, or the connection fails, we ask with `GET`, as a visitor's browser does, and the `GET` status decides. A timeout, or an address the egress proxy refuses, leads to no `GET`. We follow no redirect, so a link that answers a `3xx` redirect works for us, and we read no response's content. Each request goes through the egress proxy that vets every address, as the page's own does.
5. The rule fails for each link that answers a status from `400` to `599`, except `401`, `403`, `407`, `429` and `503`. Those five are how a site turns away a visitor it takes for a bot, one that must sign in, or one it cannot serve just now, and they say nothing of whether the link works, so we do not judge them. Nor do we judge a timeout or a failed connection. After the first `429`, with which a server asks for fewer requests, we ask for no more links. The report says how many links got no answer. When no link got one, the rule could not run.
6. We check the scanned page's links alone, and crawl none of the site's other pages.

## References

- [Google Search Central: Link best practices for Google](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Google Search Central: How HTTP status codes affect Google's crawlers](https://developers.google.com/search/docs/crawling-indexing/http-network-errors)
- [Google Search Central: Redirects and Google Search](https://developers.google.com/search/docs/crawling-indexing/301-redirects)
- [IETF: RFC 9110, §9.3.2 HEAD](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2)
- [IETF: RFC 6585, §4 429 Too Many Requests](https://www.rfc-editor.org/rfc/rfc6585#section-4)
