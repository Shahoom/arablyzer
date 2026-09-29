---
summary: How many redirects stand between your address and the page, and are they permanent?
---

# Redirect chain checker

Follows your address's redirects and shows each one: more than one before the page is a chain to shorten, and a move to HTTPS or to www should be a permanent redirect.

## What it checks

- How many redirects the address takes before the page answers: more than one is a chain, and Google advises redirecting to the final address at once.
- Each redirect's status: a move to HTTPS, or between `example.com` and `www.example.com`, made with a temporary `302`, `303` or `307` rather than a permanent `301` or `308`.

## Example

### Wrong

```http
HTTP/1.1 302 Found
Location: https://www.example.com/

HTTP/1.1 301 Moved Permanently
Location: https://www.example.com/ar/

HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

### Right

```http
HTTP/1.1 301 Moved Permanently
Location: https://www.example.com/ar/

HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

## How to fix

In the wrong example, `https://example.com/` goes to `www` with a temporary redirect, then to `/ar/` with another. Send it to the final address at once, with a permanent redirect. In nginx, in the `server` block of `example.com`:

```nginx
location = / {
    return 301 https://www.example.com/ar/;
}
location / {
    return 301 https://www.example.com$request_uri;
}
```

- In nginx, `rewrite` with its `redirect` flag answers `302`: use `return 301`, or the `permanent` flag.
- In Apache (mod_rewrite), the `R` flag alone answers `302`: write `[R=301,L]`.
- Use the final address wherever you control it, in your links, your sitemap and your canonical links, so no one needs the redirects at all.
- A temporary redirect has its uses, such as to a language chosen by the visitor's browser: this check fails only moves to HTTPS or between a name and its `www`.

## FAQ

### Why does the check say it does not apply to my page?

Because the address you gave answered with the page itself, without a redirect: there is nothing to check. Try the address your visitors type, such as `http://example.com`.

### Is one redirect a problem?

No. One redirect, such as from HTTP to HTTPS, passes; the check fails from two. A first redirect that only moves the address to HTTPS on the same name is not counted, since the HSTS preload list asks for it. Google's crawlers follow up to 10 redirects in a chain, and Google advises redirecting to the final address directly.

### Why should the move to HTTPS be a 301 and not a 302?

A `302` says the move is temporary, so clients ought to keep using the old address. Google takes a permanent redirect as a strong signal that the new address should be canonical, and a temporary one as a weak signal, and a move to HTTPS is made for good.

### Does the tool follow redirects in `<meta>` tags or JavaScript?

No, it follows HTTP redirects alone: `301`, `302`, `303`, `307` and `308`.

## Methodology

We fetch the address you give as `ArablyzerBot` and follow its HTTP redirects, up to 10, reading each site's robots.txt before we follow a redirect to it. We keep each redirect's address and status, in order, and the address of the page they lead to. The chain fails from two redirects before a page that answers with a 2xx status, not counting a first redirect that only moves the address to HTTPS on the same name. Each `302`, `303` or `307` fails when it only moves the scheme from `http:` to `https:`, only moves between a name and its `www.`, or both, keeping port, path and query. The same address gives the same result on every check, as long as the server answers the same.
