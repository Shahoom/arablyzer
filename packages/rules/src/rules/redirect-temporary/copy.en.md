# A temporary redirect for a move made for good

## Messages

### temporary

This {status} redirect is temporary, but the move from {from} to {to} is made for good: with 301 or 308, search engines take the new address as the page's own.

## Why it matters

- `301` and `308` say the address changed for good: RFC 9110 says that future references to the page ought to use the new address. `302` and `307` say the move is temporary, and that clients ought to keep using the original address.
- Google takes a permanent redirect as a signal that the new address should be canonical, and a temporary redirect as no such signal. After a move to HTTPS made with `302`, the old `http://` address can stay canonical for Google.
- A move to HTTPS, or between `example.com` and `www.example.com`, is not meant to be undone: this rule looks at those moves alone.
- A temporary redirect has its uses, such as sending visitors to their language's pages, or to another page while one is down. The rule leaves those alone.

## How to fix

Make the redirect permanent where the site sets it:

```nginx
return 301 https://www.example.com$request_uri;
```

- **nginx**: `return 301`, or the `permanent` flag of `rewrite`. Its `redirect` flag gives `302`.
- **Apache** (mod_rewrite): write `[R=301,L]`. The `R` flag alone gives `302`. With mod_alias, `Redirect permanent` gives `301`.
- Use `308` rather than `301` where a form may be sent to the old address with POST: `308` keeps the method and the body.

## How we detect

1. We fetch the address you give as `ArablyzerBot` and follow its redirects. The rule applies when there was one at least.
2. Each `302` or `307` fails whose move only changes the scheme from `http:` to `https:`, only changes the name between `example.com` and `www.example.com`, or both, keeping the port, the path and the query.
3. Other temporary moves, to another path, name or query, pass: they may be meant. So does `303`, which is mostly the answer to a form sent with POST.

## References

- [Google Search Central: Redirects and Google Search](https://developers.google.com/search/docs/crawling-indexing/301-redirects)
- [IETF: RFC 9110, §15.4 Redirection 3xx](https://www.rfc-editor.org/rfc/rfc9110#section-15.4)
- [MDN: Redirections in HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Redirections)
