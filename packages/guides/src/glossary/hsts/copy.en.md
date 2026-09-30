# HTTP Strict Transport Security (HSTS)

HSTS is a response header that tells browsers to reach a site over HTTPS only, for a set time, so later visits never start over plain HTTP.

## Definition

- HSTS is defined in RFC 6797 (IETF, 2012): a way for a site to declare itself reachable only over secure connections, with the `Strict-Transport-Security` header in its HTTPS responses.
- Its `max-age` directive, required, is how many seconds the browser keeps the policy; `includeSubDomains`, optional, extends it to every subdomain. `preload` is not in the standard: the HSTS preload list asks for it.
- Once the browser has the policy, it turns every `http://` URL for the site into `https://` before sending the request, and offers no way past a certificate error. It applies to domain names only, never to an IP address.

## Why it matters

- Without HSTS, a visitor who types the site’s name, or follows an old `http://` link, sends the first request over HTTP until the site redirects them. On an untrusted network, such as a fake public Wi-Fi hotspot, that request can be intercepted.
- With HSTS, the browser skips HTTP for `max-age` seconds, and restarts the count each time it sees the header.
- The first visit, before the browser has seen the header, stays exposed. The preload list closes that gap, as browsers ship with it; but hstspreload.org warns that removal from the list takes months to reach Chrome users.

## Example

The answer to `http://example.com/` redirects without the header; the answer over HTTPS carries it, here for a year and every subdomain:

```http
HTTP/1.1 301 Moved Permanently
Location: https://example.com/

HTTP/1.1 200 OK
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

hstspreload.org suggests starting with a short `max-age`, such as five minutes (`max-age=300`), then a week, then a month, before a long one.

## Common mistakes

- Sending the header over HTTP, or on the redirect from HTTP: browsers ignore it there.
- `includeSubDomains` before every subdomain works on HTTPS: those served only over HTTP become unreachable.
- `max-age=0` left over from a test: it tells browsers to forget the policy.
- Sending it from `example.com` alone while every link goes to `www.example.com`: the browser never sees it, so each host should send it.
- Joining the preload list before the whole domain is ready for HTTPS.

## References

- [IETF: RFC 6797, HTTP Strict Transport Security (HSTS)](https://www.rfc-editor.org/rfc/rfc6797)
- [MDN: Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security)
- [HSTS preload list](https://hstspreload.org/)
