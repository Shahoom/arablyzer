---
summary: Does your page send the headers that protect its visitors in the browser?
---

# Security headers checker

Checks the security headers your page sends, as browsers read them: HSTS, a Content Security Policy, X-Content-Type-Options, framing protection and a referrer policy.

## What it checks

- `Strict-Transport-Security` (HSTS) on an HTTPS page, with a `max-age` above zero and written as RFC 6797 asks, so browsers keep to HTTPS.
- An enforced Content Security Policy, in the `Content-Security-Policy` header or a `<meta http-equiv>` in `<head>`. A `Content-Security-Policy-Report-Only` header blocks nothing, so it does not count.
- `X-Content-Type-Options: nosniff`, so browsers take each response's `Content-Type` as sent instead of guessing it.
- Protection from framing, against clickjacking: `frame-ancestors` in the policy header, or `X-Frame-Options` of `DENY` or `SAMEORIGIN`.
- A referrer policy, in a `Referrer-Policy` header or a `<meta name="referrer">`. This one is information: browsers already default to `strict-origin-when-cross-origin`.

## Example

### Wrong

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
X-Frame-Options: ALLOW-FROM https://partner.example/
```

### Right

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; frame-ancestors 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
```

## How to fix

Add the headers where your server writes its responses. In nginx, in the `server` block of your HTTPS site:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'; frame-ancestors 'self'" always;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options SAMEORIGIN always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
```

- In nginx, a `location` block with an `add_header` of its own does not inherit those of the `server` block, so repeat them there.
- In Apache (mod_headers), each header is a `Header always set` line, such as `Header always set X-Content-Type-Options "nosniff"`.
- In Cloudflare, a Response Header Transform Rule can set each of them.
- Write the policy for what your pages load: `default-src 'self'` suits a site whose files all come from its own domain, with no inline code. Try yours as `Content-Security-Policy-Report-Only` first, and read what it would block.
- `includeSubDomains` covers every subdomain: keep it once they all work over HTTPS, or start without it.

## FAQ

### Can I set these headers in a `<meta>` tag instead?

Two of them. A Content Security Policy works in `<meta http-equiv="Content-Security-Policy">` inside `<head>`, without `frame-ancestors`, `report-uri` and `sandbox`, and a referrer policy works in `<meta name="referrer">`. Browsers read HSTS, `X-Content-Type-Options` and `X-Frame-Options` from the response's headers alone.

### Why is the referrer policy not deducted from my score?

Because browsers already use `strict-origin-when-cross-origin` when a page sets no policy, which sends other sites the origin alone. The check says so as information, so you can state the policy yourself; before a change to the standard in November 2020, the default sent other sites the full address.

### Does a pass mean my headers are strict enough?

No. The check finds each header and reads it as browsers do, but it does not judge what your Content Security Policy allows, nor which sites `frame-ancestors` lets frame the page. A policy of `default-src *` passes, and protects little.

### Does the tool check the headers of my scripts and stylesheets?

No, it reads the page's own response. Send the same headers on every response: `X-Content-Type-Options` matters as much on scripts and stylesheets, which browsers refuse with it when their `Content-Type` is wrong.

## Methodology

We fetch the page as `ArablyzerBot`, follow its redirects, and read the final response's headers and its HTML as the server sends them, before any JavaScript runs. We read each header as browsers do: the policy as Content Security Policy Level 3 parses it, `X-Content-Type-Options` by its first value as the Fetch standard says, `X-Frame-Options` as the HTML standard says, `Referrer-Policy` by the last value browsers know, and `Strict-Transport-Security` as RFC 6797 writes it. The checks apply to HTML pages that answer with a 2xx status on a public site, and HSTS to HTTPS pages on a host name. The referrer policy is information, never deducted from the score. The same page gives the same result on every check.
