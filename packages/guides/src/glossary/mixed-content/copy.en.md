# Mixed content

Mixed content is an HTTPS page that loads scripts, styles, images or media over plain HTTP; browsers block some of it and ask for the rest over HTTPS.

## Definition

- A page has mixed content when it is loaded over HTTPS but requests some of its resources over HTTP, without encryption.
- Browsers sort it into two kinds. Upgradable content, images, audio and video, is requested over HTTPS instead, and does not load if it is not there. Blockable content is blocked: scripts, stylesheets, frames, web fonts, requests made with `fetch()`, and images chosen by `srcset` or `<picture>`. Images on an IP address rather than a domain name are blocked too.
- A form on an HTTPS page that sends to an `http:` address sends what is typed without encryption, and browsers may warn before sending it.

## Why it matters

- A blocked script or stylesheet breaks the page: features stop working, or the page loses its styles.
- Anyone on the path of an HTTP request can read or change what it carries: a changed script can take over the page, and a changed image can deface it.
- An image that exists only over HTTP disappears once browsers upgrade its request, as Firefox has done since version 127.

## Example

The same script over HTTP and over HTTPS:

```html
<!-- Blocked on an HTTPS page -->
<script src="http://cdn.example.com/app.js"></script>

<!-- Loads -->
<script src="https://cdn.example.com/app.js"></script>
```

The `Content-Security-Policy: upgrade-insecure-requests` header has the browser request every `http:` address of the page over HTTPS, but the addresses stay wrong wherever the HTML is read without it, so fix them too.

## Common mistakes

- `http://` addresses left in the theme, in old posts or in the database after the site moved to HTTPS.
- Resources from another site that does not serve them over HTTPS: move them to your site, or replace them.
- Counting on the browser's upgrade for images: an image that is not on HTTPS does not show.

## References

- [W3C: Mixed Content](https://www.w3.org/TR/mixed-content/)
- [MDN: Mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content)
- [web.dev: What is mixed content?](https://web.dev/articles/what-is-mixed-content)
- [Mozilla: Firefox will upgrade more mixed content in version 127](https://blog.mozilla.org/security/2024/06/05/firefox-will-upgrade-more-mixed-content-in-version-127/)
