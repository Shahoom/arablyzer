# HTTPS without HSTS

## Messages

### missing

This page is on HTTPS but sends no `Strict-Transport-Security` header, so browsers are not told to use HTTPS alone for this site: a visitor who types the address or follows an `http:` link may reach it over HTTP first.

### zero

The `Strict-Transport-Security` header has `max-age=0`, which asks the browser to forget that the site is on HTTPS.

### invalid

The `Strict-Transport-Security` header is not valid (`{value}`), so the browser ignores it.

## Why it matters

- A visitor who types the site's name without `https://`, or follows an old link that starts with `http:`, sends the first request over HTTP before the site redirects it. At that moment, anyone on the way can keep them on HTTP and read what they send.
- The `Strict-Transport-Security` header (HSTS) tells the browser to use only HTTPS for this site for `max-age` seconds, so no later request goes over HTTP.
- Some browsers now try HTTPS first by themselves (Chrome does), and a site on the HSTS preload list is covered from the first visit in browsers that ship the list. The header is what tells every browser, and the list asks for it too.

## How to fix

Send the header in HTTPS responses, for a year, for example:

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

- `includeSubDomains` covers subdomains, so add it once you are sure they all work on HTTPS, or start with a short duration and raise it.
- The HSTS preload list adds your site to the browsers themselves, so even the first visit goes over HTTPS. Its requirements are on its site.

## How we detect

1. We read the first `Strict-Transport-Security` header of the page's response, since the browser reads only the first.
2. The rule fails when there is none, when its `max-age` is zero, or when it breaks the header's grammar (RFC 6797), which makes browsers ignore it: without `max-age`, with `max-age` or `includeSubDomains` twice, with a value on `includeSubDomains`, or with a quote left open.
3. Pages on HTTP and IP addresses are left out, since browsers keep no HSTS for them.

## References

- [IETF: RFC 6797, HTTP Strict Transport Security](https://www.rfc-editor.org/rfc/rfc6797)
- [MDN: Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security)
- [HSTS preload list](https://hstspreload.org/)
