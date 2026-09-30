# No X-Content-Type-Options: nosniff

## Messages

### missing

The page sends no `X-Content-Type-Options: nosniff` header, so browsers may guess a response's type from its content instead of its `Content-Type`.

### invalid

The first value of the `X-Content-Type-Options` header is `{value}`, not `nosniff`, so browsers ignore it.

## Why it matters

- Without the header, browsers may examine a response's content to guess its type instead of trusting its `Content-Type`: this is MIME type sniffing.
- With `X-Content-Type-Options: nosniff`, the browser takes the `Content-Type` as sent. MDN's example: a `text/plain` response that holds HTML markup is not read as HTML.
- The browser also refuses a stylesheet whose type is not `text/css`, and a script whose type is not a JavaScript type: a file on your site sent as text, such as one a visitor uploaded, cannot be loaded as a script.
- OWASP recommends the header, with the right `Content-Type` throughout the site.

## How to fix

Send the header on every response:

```http
X-Content-Type-Options: nosniff
```

- **Apache** (mod_headers): `Header always set X-Content-Type-Options "nosniff"`
- **nginx**: `add_header X-Content-Type-Options nosniff always;`
- In nginx, a `location` block with an `add_header` of its own does not inherit those of the `server` block, so repeat the header there.
- **Cloudflare**: a Response Header Transform Rule that sets the header.
- Check each file's `Content-Type` too: `text/css` for stylesheets and `text/javascript` for scripts. With the header, the browser refuses a stylesheet or a script sent with another type.

## How we detect

1. The rule applies to HTML pages that answer 2xx on a public site. Local development hosts, such as `localhost`, private addresses and names ending in `.test`, are left out, as for the HTTPS rule: the header protects a public site's visitors.
2. We read the `X-Content-Type-Options` headers as browsers do (the Fetch standard's "determine nosniff"): all of them make one list, split at commas, and the first value must be `nosniff`, whatever its case. Any other first value is ignored.
3. We read the page's own response. The header matters as much on scripts and stylesheets, which this rule does not fetch.

## References

- [MDN: X-Content-Type-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options)
- [WHATWG Fetch: the X-Content-Type-Options header](https://fetch.spec.whatwg.org/#x-content-type-options-header)
- [OWASP: HTTP Security Response Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
