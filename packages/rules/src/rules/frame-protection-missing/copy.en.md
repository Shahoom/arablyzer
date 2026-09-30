# Any site may show the page in a frame

## Messages

### missing

Nothing keeps other sites from showing this page in a frame: it sends no `frame-ancestors` directive in a `Content-Security-Policy` header, and no `X-Frame-Options` of `DENY` or `SAMEORIGIN`.

### any-ancestor

This page's `Content-Security-Policy` lets any site show it in a frame (`frame-ancestors {value}`), and browsers then ignore `X-Frame-Options`. Name the sites that may frame the page, or use `'self'` or `'none'`.

### x-frame-options-ignored

Browsers ignore this `X-Frame-Options` header (`{value}`): only `DENY` and `SAMEORIGIN` keep the page out of other sites' frames, and `ALLOW-FROM` is obsolete.

### meta

This `<meta>` cannot keep the page out of frames: browsers read `frame-ancestors` and `X-Frame-Options` only from the response's headers.

## Why it matters

- A page any site may frame is open to clickjacking: another site loads it in a frame it hides over its own content, and a visitor who thinks they are clicking that site clicks a button on your page, such as buy, delete or share.
- A `frame-ancestors` directive in a `Content-Security-Policy` header says which sites may frame the page: `'none'` for none, `'self'` for your own site. It supersedes `X-Frame-Options`: when a response has both, browsers ignore `X-Frame-Options`.
- `X-Frame-Options` does the same with `DENY` or `SAMEORIGIN`. Its `ALLOW-FROM` form is obsolete, and browsers ignore it.
- Neither works from a `<meta>` tag: browsers read both from the response's headers alone.

## How to fix

Send `frame-ancestors` in your policy header, and `X-Frame-Options` for older browsers, which OWASP suggests:

```http
Content-Security-Policy: frame-ancestors 'self'
X-Frame-Options: SAMEORIGIN
```

- **Apache** (mod_headers): `Header always set X-Frame-Options "SAMEORIGIN"`, and `frame-ancestors 'self'` in your `Content-Security-Policy`.
- **nginx**: `add_header X-Frame-Options SAMEORIGIN always;`, and the directive in your policy header. A `location` block with an `add_header` of its own does not inherit those of the `server` block, so repeat them there.
- **Cloudflare**: a Response Header Transform Rule that sets the headers.
- If the page already has a `Content-Security-Policy`, add the directive to it, or send a second policy that holds it alone: browsers enforce every policy they receive.
- Use `'none'` and `DENY` if the page never belongs in a frame, even on your site. A page meant for other sites, such as a widget, names them: `frame-ancestors https://partner.example`.

## How we detect

1. The rule applies to HTML pages that answer 2xx on a public site. Local development hosts, such as `localhost`, private addresses and names ending in `.test`, are left out, as for the HTTPS rule: the headers protect a public site's visitors.
2. The page passes with a `frame-ancestors` directive in a `Content-Security-Policy` header, read as browsers read the policy, unless its sources let any site in: `*`, a scheme alone such as `https:`, or `https://*`. Browsers then ignore `X-Frame-Options`. A `Content-Security-Policy-Report-Only` header and a `<meta>` do not count.
3. Otherwise we read `X-Frame-Options` as the HTML standard says: all its values, split at commas and lowercased. A single `DENY` or `SAMEORIGIN` passes. Different values that include `DENY`, `SAMEORIGIN` or `ALLOWALL` make browsers refuse every frame, so they pass too. Any other value, `ALLOW-FROM` among them, is ignored.
4. A `<meta>` that tries either one is named in the findings.

## References

- [MDN: X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options)
- [MDN: CSP frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)
- [HTML Standard: the X-Frame-Options header](https://html.spec.whatwg.org/#the-x-frame-options-header)
- [OWASP: Clickjacking Defense Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html)
