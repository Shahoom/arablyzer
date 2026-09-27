# Mixed content: an HTTPS page that loads over HTTP

## Messages

### blockable

The page is on HTTPS, but the `{tag}` element loads {url} over HTTP. Browsers block that load, so whatever depends on it does not work.

### upgradable

The page is on HTTPS, but the `{tag}` element loads {url} over HTTP. Chrome and Firefox ask for it over HTTPS instead, so it does not show if it is not there.

### form

This form sends what is typed into it to {url} over HTTP, without encryption.

## Why it matters

- **Scripts, stylesheets, frames, icons and subtitles:** browsers block them on HTTPS pages, since anyone on the way could change them, so the page breaks or loses its styles. So too images chosen by `srcset` or `<picture>`, and images on an IP address rather than a domain name.
- **Other images, video and audio:** browsers that follow Mixed Content Level 2, Chrome and Firefox among them, ask for them over HTTPS instead, so they vanish when they are not there. Other browsers load them and show the page as not secure.
- **Forms:** what the visitor types, such as a password or a phone number, is sent in the clear, and browsers warn before sending it.

## How to fix

- Change `http://` to `https://` in resource addresses, or use paths that start with `/` on the same site.
- For a resource on another site that does not work over HTTPS: move it to your site, or replace it.
- `Content-Security-Policy: upgrade-insecure-requests` has the browser ask for every `http:` address over HTTPS, forms included, so the page passes this rule. The addresses are still wrong wherever the HTML is read without it, so fix them too.

## How we detect

1. The rule applies to HTTPS pages.
2. We read the page's HTML for elements that load over `http:`: `script`, `iframe`, `object`, `embed`, `link` for stylesheets and icons, and `img`, `srcset`, `video`, `audio`, `source` and `track`; and for forms that send to `http:` (`action`, and `formaction` on a form's submit button).
3. We resolve each address as the browser does, including what `<base>` changes, and read `srcset` as HTML does. A script the browser does not fetch, such as `nomodule` or a template, does not count.
4. A page that asks for `upgrade-insecure-requests`, in a `Content-Security-Policy` header or in a `<meta>` in `<head>` before the element, passes: the browser fetches each address over HTTPS. A `Content-Security-Policy-Report-Only` header upgrades nothing.
5. We do not check what scripts add to the page after it loads.

## References

- [W3C: Mixed Content](https://www.w3.org/TR/mixed-content/)
- [MDN: Mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content)
- [Mozilla: Firefox will upgrade more mixed content in version 127](https://blog.mozilla.org/security/2024/06/05/firefox-will-upgrade-more-mixed-content-in-version-127/)
