# Page without HTTPS

## Messages

### http

This page is served over HTTP, without encryption: {url}

## Why it matters

- Browsers show "Not secure" next to the address of a page served over HTTP.
- Anyone on the way between the visitor and the site, such as a public Wi-Fi network, can read and change the page, including what the visitor types into its forms.
- Many browser features work only on HTTPS pages, such as geolocation and notifications.
- Google has used HTTPS as a signal in ranking search results since 2014.

## How to fix

- Install a TLS certificate. Let's Encrypt's certificates are free and renew automatically, and most hosting companies install them in one click.
- Redirect every HTTP request to its HTTPS address with a permanent redirect (301).
- Then add HSTS, so the browser stays on HTTPS on later visits.

## How we detect

1. We read the page's final address, after redirects.
2. The rule fails when it starts with `http:`.
3. Local development addresses are left out: `localhost`, private addresses such as `192.168.1.10`, and names reserved for local use such as `.test`, `.local` and `.internal`.

## References

- [MDN: Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)
- [Let's Encrypt: Getting started](https://letsencrypt.org/getting-started/)
- [Google: HTTPS as a ranking signal (2014)](https://developers.google.com/search/blog/2014/08/https-as-ranking-signal)
