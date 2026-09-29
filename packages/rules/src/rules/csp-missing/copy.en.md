# No Content Security Policy

## Messages

### missing

The page sends no `Content-Security-Policy` header and has no `<meta http-equiv="Content-Security-Policy">` in `<head>`, so nothing tells browsers which scripts and other resources it may load.

### report-only

The page has only a `Content-Security-Policy-Report-Only` header, which reports what its policy would block but blocks nothing.

### meta-ignored

Browsers ignore this `<meta http-equiv="Content-Security-Policy">`: they read it only inside `<head>`, and never its `frame-ancestors`, `report-uri` or `sandbox` directives.

## Why it matters

- A Content Security Policy (CSP) tells the browser where the page may load scripts, styles, images and other resources from, and the browser refuses the rest. Its main use is against cross-site scripting (XSS): a script someone slips into the page, through a comment or a search field, does not run when the policy does not allow it.
- Without a policy, the browser runs every script that ends up in the page.
- OWASP calls it a layer on top of the other defences, not a replacement: pages still need to escape what visitors write.
- `Content-Security-Policy-Report-Only` is for trying a policy out: the browser reports what it would block, and blocks nothing.

## How to fix

Send a policy for what your pages really load. OWASP's basic policy suits a site whose resources all come from its own domain, with no inline code:

```http
Content-Security-Policy: default-src 'self'; frame-ancestors 'self'; form-action 'self'
```

- **Apache** (mod_headers): `Header always set Content-Security-Policy "default-src 'self'; frame-ancestors 'self'; form-action 'self'"`
- **nginx**: `add_header Content-Security-Policy "default-src 'self'; frame-ancestors 'self'; form-action 'self'" always;`
- In nginx, a `location` block with an `add_header` of its own does not inherit those of the `server` block, so repeat the header there.
- **Cloudflare**: a Response Header Transform Rule that sets the header.
- Without access to the server, put the policy in a `<meta http-equiv="Content-Security-Policy">` early in `<head>`. It covers only what comes after it, and it cannot set `frame-ancestors`, `report-uri` or `sandbox`.
- A page that loads scripts from other sites, or has inline scripts, needs those sources in its policy: send it as `Content-Security-Policy-Report-Only` first, read what it would block, then send it as `Content-Security-Policy`.

## How we detect

1. The rule applies to HTML pages that answer 2xx on a public site. Local development hosts, such as `localhost`, private addresses and names ending in `.test`, are left out, as for the HTTPS rule: the policy protects a public site's visitors.
2. We read the `Content-Security-Policy` headers as browsers do (CSP Level 3): a header may hold several policies separated by commas, a policy counts when it has at least one directive, directive names are read whatever their case, and a directive with non-ASCII characters is skipped.
3. A `<meta http-equiv="Content-Security-Policy">` counts inside `<head>`, less `frame-ancestors`, `report-uri` and `sandbox`, which browsers drop from a `<meta>`.
4. A `Content-Security-Policy-Report-Only` header does not count, since it blocks nothing.
5. We check that a policy is enforced, not what it allows: a loose policy passes this rule, and so does one without `default-src` or `script-src`, which limits no scripts at all.

## References

- [MDN: Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
- [W3C: Content Security Policy Level 3](https://www.w3.org/TR/CSP3/)
- [OWASP: Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
