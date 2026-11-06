---
reviewed: false
---

# Content Security Policy (CSP)

A Content Security Policy is a set of instructions a site sends the browser to limit what a page loads and runs, a layer of defence against cross-site scripting (XSS).

## Definition

- Content Security Policy (CSP) is a series of instructions from a site to the browser, which uses them to limit what the code making up the page is allowed to do. MDN says its main use is to control which resources, JavaScript above all, a document may load, as a defence against cross-site scripting (XSS).
- The policy arrives in the `Content-Security-Policy` response header, and MDN advises setting it on every response, not only the main document. It is a list of directives separated by semicolons, each a name followed by its value. `default-src 'self'` asks the browser to load only what comes from the document's own origin, unless a more specific directive says otherwise.
- Directives include `script-src` for JavaScript sources, `default-src` as the fallback for any resource with no directive of its own, and `frame-ancestors` for who may embed the page in a frame such as an `<iframe>`.
- The `Content-Security-Policy-Report-Only` header tries a policy without enforcing it: it blocks nothing, but violations go to the reporting endpoint named in the policy. A policy can also be set in a `<meta http-equiv="Content-Security-Policy">` tag, though that does not support every feature.

## Why it matters

- Script injection means someone slips a script into your page, through a comment or a search field for example, and the browser runs it as if it came from you. If the script comes from a source the policy does not allow, the browser does not run it.
- MDN and the W3C both describe the policy as defence in depth: it limits the damage of an injection, but does not replace sanitising input and encoding output before it is shown.
- With `default-src` or `script-src` in the policy, inline JavaScript is blocked, meaning a `<script>` written in the page, event handlers such as `onclick` and `javascript:` links, unless extra measures enable it. So a page that loads scripts from other sites, or has inline scripts, needs a policy that names those sources.
- MDN adds that CSP is also used to guard against the page being embedded in deceptive frames (clickjacking), and to help make sure a site's pages load over HTTPS. See also HSTS and mixed content.
- Arablyzer's `csp-missing` rule checks that an enforced policy exists, not how tight it is: the `Content-Security-Policy-Report-Only` header alone does not count.

## Example

Start with a trial policy that reports violations and blocks nothing. MDN says the `report-to` directive is required in this header or nothing is sent, and the destination is defined in the `Reporting-Endpoints` header:

```http
Reporting-Endpoints: csp-endpoint="https://example.com/csp-reports"
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://cdn.example.com; report-to csp-endpoint
```

Read the reports that arrive, adjust the policy until it names only what your pages need, then send it enforced:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.example.com; frame-ancestors 'none'
```

MDN advises that unless you want your page embedded in other pages, you set `frame-ancestors` to `'none'`.

## Common mistakes

- Sending only `Content-Security-Policy-Report-Only` and assuming the page is protected: it reports, it does not block.
- Putting `frame-ancestors`, `report-uri` or `sandbox` in a `<meta>` tag: the W3C says the tag does not support them, nor `Report-Only`.
- Placing the `<meta>` tag after the scripts: its policy does not cover content that comes before it, and the W3C encourages putting it early.
- Adding `'unsafe-inline'` to silence errors: MDN warns it defeats much of the purpose of the policy. Use a nonce or a hash instead.
- A fixed or guessable nonce: it must change with every response and not be predictable (MDN).
- Treating the policy as a substitute for sanitising what visitors type.

## References

- [MDN: Content Security Policy (CSP)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
- [MDN: Content-Security-Policy-Report-Only header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy-Report-Only)
- [W3C: Content Security Policy Level 3](https://www.w3.org/TR/CSP3/)
