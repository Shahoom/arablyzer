---
summary: Is your page on HTTPS, with a certificate that is not about to expire, and HSTS?
---

# SSL certificate and HTTPS checker

Checks that your page is served over HTTPS, that its SSL/TLS certificate has not expired and is not about to, and that it sends HSTS so browsers keep to HTTPS.

## What it checks

- That the page's final address, after its redirects, starts with `https:`. Local development addresses are left out.
- That the certificate the server presented has not expired, and does not end within 14 days, or within a third of its lifetime when that is shorter.
- That an HTTPS page sends `Strict-Transport-Security` with a `max-age` above zero, written as RFC 6797 asks, so browsers keep to HTTPS on later visits.

## Example

### Wrong

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

### Right

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## How to fix

- Install a TLS certificate. Let's Encrypt's certificates are free, and renewal tools such as Certbot renew them by themselves.
- Redirect every HTTP request to its HTTPS address, with a permanent redirect (301).
- Keep renewal automatic, and test it: with Certbot, `certbot renew --dry-run` tries a renewal without changing anything.
- Then send HSTS on your HTTPS responses, for a year:

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

- `includeSubDomains` covers every subdomain: keep it once they all work over HTTPS, or start without it.

## FAQ

### Why does the example show only a header?

Because the address and the certificate come from the connection itself, which an example on a page cannot show: the check reads them from your server when you run it. The example shows HSTS, the part of HTTPS that the response's headers carry.

### What if my certificate is not trusted, or is for another name?

Our fetch verifies the certificate, the authority that signed it and the name it is for, so the connection fails. The result then says that the secure connection failed, instead of judging the page.

### How early should I renew?

Let's Encrypt's certificates last 90 days, and it advises renewing them every 60, which automatic renewal tools do. The check fails when fewer than 14 days are left: by then, automatic renewal has stopped for over two weeks.

### Does HTTPS on this page mean my whole site is on HTTPS?

No. The check reads the address you give and the redirects it follows. Check your other pages too, and use the mixed content check for what a page loads over HTTP.

## Methodology

We fetch the page as `ArablyzerBot` and follow its redirects. We read the final address, the dates of the certificate the server presented, and the `Strict-Transport-Security` header of its response. The address fails when it starts with `http:` on a public site. The certificate fails when it has expired, or has fewer than 14 days left, or less than a third of its lifetime when that is shorter. HSTS fails when an HTTPS page on a host name sends none, sends `max-age=0`, or writes it in a way RFC 6797 says browsers ignore; browsers read only the first such header, and so do we. The time left is counted from the moment of the check, which the report keeps.
