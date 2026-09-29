# No referrer policy

## Messages

### missing

The page sets no referrer policy, in a `Referrer-Policy` header or a `<meta name="referrer">`, so browsers use their default, `strict-origin-when-cross-origin`.

### invalid

`{value}` is not a referrer policy browsers know, so they use their default, `strict-origin-when-cross-origin`.

## Why it matters

- When a visitor follows a link, or the page loads a file from another site, the browser sends a `Referer` header with the address of the page it came from. An address can say more than it should: MDN warns of internal addresses, and of parameters that hold private data.
- A referrer policy says how much of the address to send. Current browsers default to `strict-origin-when-cross-origin`: the full address within your site, the origin alone to other sites, and nothing from HTTPS to HTTP. That is why this rule is information, and never costs the page points.
- Before a change to the standard in November 2020, the default was `no-referrer-when-downgrade`, which sends other sites the full address. Stating the policy covers browsers from before the change, and says it is a choice.

## How to fix

Send the policy OWASP recommends, which is also the browsers' default:

```http
Referrer-Policy: strict-origin-when-cross-origin
```

- **Apache** (mod_headers): `Header always set Referrer-Policy "strict-origin-when-cross-origin"`
- **nginx**: `add_header Referrer-Policy strict-origin-when-cross-origin always;`
- **Cloudflare**: a Response Header Transform Rule that sets the header.
- Without access to the server, set it in `<head>`: `<meta name="referrer" content="strict-origin-when-cross-origin" />`, with a single value.
- If your addresses hold private data, choose a stricter policy: `same-origin` sends nothing to other sites, and `no-referrer` sends nothing at all.

## How we detect

1. The rule applies to HTML pages that answer 2xx on a public site. Local development hosts, such as `localhost`, private addresses and names ending in `.test`, are left out, as for the HTTPS rule.
2. We read the `Referrer-Policy` headers as browsers do: their values split at commas, and the last one browsers know wins, so a new policy can fall back on an older one. A value made of anything but letters and hyphens makes the header invalid. Policies are read whatever their case, as Chromium reads them.
3. A `<meta name="referrer">` counts anywhere in the page, with a single value in any case, the old values HTML still accepts included: `never`, `default`, `always` and `origin-when-crossorigin`.
4. A `referrerpolicy` attribute, or `rel="noreferrer"`, sets the policy of one link or file, not of the page, so it does not count.
5. The finding is information: it is never deducted from the score.

## References

- [MDN: Referrer-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy)
- [MDN: Referrer policy configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Referrer_policy)
- [W3C: Referrer Policy](https://w3c.github.io/webappsec-referrer-policy/)
- [OWASP: HTTP Security Response Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
