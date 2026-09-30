# HTTPS

HTTPS is HTTP encrypted with TLS: it keeps anyone on the way from reading or changing what visitors and sites exchange. Many browser features need it, and Google prefers it.

## Definition

- HTTPS is HTTP encrypted with TLS. An `https` URL means the server has proven it acts for the requested domain, and the connection is protected from reading and tampering.
- The browser checks the server's certificate: if it is not valid for the domain, the browser ends the connection or asks the user first. The `http` and `https` versions of a URL are different origins.

## Why it matters

- It guarantees visitors that no one between them and the site eavesdropped on or tampered with what they exchanged, including what they type into forms.
- Many browser features work only in a secure context, such as an HTTPS page: among them geolocation, notifications and the Payment Request API.
- Google strongly recommends HTTPS and prefers to index a page's HTTPS version, except when there are problems such as an invalid certificate or a redirect to HTTP.
- When each language has its own subdomain, such as `ar.example.com` and `en.example.com`, the certificate must match each name, with one certificate per subdomain or a wildcard certificate.

## Example

Checking that the site sends HTTP to HTTPS with a permanent redirect:

```text
$ curl -I http://example.com/ar/
HTTP/1.1 301 Moved Permanently
Location: https://example.com/ar/
```

Then make sure the canonical URLs, the sitemap and the `hreflang` links all use `https://`.

## Common mistakes

- An expired certificate, or one that does not match the name, such as one covering `www.example.com` but not `example.com`: browsers stop or warn, and Search Console says it typically affects the whole site.
- A script loaded over `http://` on an HTTPS page: this is mixed content, and the browser blocks it. Images may be upgraded to `https` by the browser, or blocked.
- An HTTPS page that redirects to HTTP, or a canonical or sitemap that points to HTTP.
- Blocking the HTTPS version from crawling in robots.txt.

## References

- [MDN: HTTPS](https://developer.mozilla.org/en-US/docs/Glossary/HTTPS)
- [RFC 9110: HTTP Semantics, the https URI scheme](https://www.rfc-editor.org/rfc/rfc9110.html#name-https-uri-scheme)
- [W3C: Mixed Content](https://www.w3.org/TR/mixed-content/)
- [MDN: Features restricted to secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts/features_restricted_to_secure_contexts)
- [Search Console Help: HTTPS report](https://support.google.com/webmasters/answer/11396518)
- [Google Search Central: How to specify a canonical URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
