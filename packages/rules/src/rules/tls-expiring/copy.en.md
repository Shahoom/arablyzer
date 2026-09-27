# TLS certificate about to expire

## Messages

### expiring

The site's certificate expires on {date} (days left: {days}). After that, browsers stop visits with a warning page.

### expired

The site's certificate expired on {date}, and browsers stop visits with a warning page.

## Why it matters

- Once the certificate expires, the browser shows a full warning page instead of the site, and most visitors go no further.
- Let's Encrypt's certificates last 90 days, and it advises renewing them every 60, which automatic renewal tools do. So a certificate close to its end usually means automatic renewal has stopped.

## How to fix

- Renew the certificate now, then find out why automatic renewal stopped: with certbot, for example, `certbot renew --dry-run` tries a renewal without changing anything.
- And watch the certificate's expiry date, so you know before your visitors do.

## How we detect

1. We read the expiry date of the certificate the site sent when we fetched the page, and count the time left from the moment of the scan.
2. The rule fails when fewer than 14 days are left, or less than a third of the certificate's lifetime when that is shorter: Let's Encrypt's short-lived certificates last 6 days, so two days of them are a third.
3. It does not apply to pages on HTTP.

## References

- [Let's Encrypt: FAQ, certificate lifetimes](https://letsencrypt.org/docs/faq/)
- [Let's Encrypt: Six-day certificates](https://letsencrypt.org/2025/01/16/6-day-and-ip-certs/)
