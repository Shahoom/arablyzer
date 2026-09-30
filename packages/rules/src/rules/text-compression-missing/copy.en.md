# Text sent without compression

## Messages

### uncompressed

{url} is sent without compression ({size} KB). Gzipped, it is {gzipped} KB, which saves {saved} KB for every visitor.

## Why it matters

- HTML, CSS, JavaScript and JSON are text, and text compresses well.
- Every browser decompresses gzip, and Brotli too on HTTPS pages, and tells the server so in every request (the `Accept-Encoding` header).
- Every extra kilobyte delays the page, most of all on mobile networks.

## How to fix

Turn on compression in the server: gzip, or Brotli, which compresses further and which browsers ask for over HTTPS only. In nginx, for example:

```nginx
gzip on;
gzip_types text/css application/javascript application/json image/svg+xml;
```

- In Apache, `mod_deflate` does it, and most content delivery networks (CDNs) compress text by themselves.
- Make sure the responses applications generate go through compression too, not only static files.

## How we detect

1. We render the page and read the text responses the browser loaded: the page itself, scripts, stylesheets, and data responses (XHR and fetch).
2. We gzip each one that came without `Content-Encoding`, as Lighthouse 12 did.
3. The rule fails when that saves at least 1,400 bytes, and at least 10% of the file or 20,000 bytes: Lighthouse 12's own limits.
4. We do not read a file whose size we could not know before reading it, or one larger than 5 MB.

## References

- [MDN: Compression in HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Compression)
- [Chrome: Enable text compression](https://developer.chrome.com/docs/lighthouse/performance/uses-text-compression)
- [nginx: Module ngx_http_gzip_module](https://nginx.org/en/docs/http/ngx_http_gzip_module.html)
