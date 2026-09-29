---
summary: Does your HTTPS page load files or images over unencrypted HTTP?
---

# Mixed content checker

Checks that your HTTPS page loads no scripts, stylesheets, frames or images over HTTP, and sends no form to an HTTP address, which browsers block or warn about.

## What it checks

- Scripts, stylesheets and icons in `<link>`, `iframe`, `object`, `embed` and `track`, and images in `srcset` or `<picture>` or on an IP address, loaded over `http:`, which browsers block.
- Other images, video and audio over `http:`, which Chrome and Firefox ask for over HTTPS instead, so they vanish when they are not there.
- Forms that send what is typed into them to `http:`, in `action`, or in `formaction` on a submit button.
- An `upgrade-insecure-requests` policy in a `Content-Security-Policy` header or a `<meta>` in `<head>`, which has the browser ask for all of these over HTTPS.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <link rel="stylesheet" href="http://cdn.example.com/style.css" />
  </head>
  <body>
    <h1>حلوى عمانية في علب</h1>
    <img src="http://cdn.example.com/halwa.jpg" alt="علبة حلوى عمانية" />
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <link rel="stylesheet" href="https://cdn.example.com/style.css" />
  </head>
  <body>
    <h1>حلوى عمانية في علب</h1>
    <img src="https://cdn.example.com/halwa.jpg" alt="علبة حلوى عمانية" />
  </body>
</html>
```

## How to fix

Change `http://` to `https://` in resource and form addresses, or use paths that start with `/` on the same site:

```html
<link rel="stylesheet" href="https://cdn.example.com/style.css" />
<img src="/images/halwa.jpg" alt="علبة حلوى عمانية" />
<form action="https://example.com/subscribe" method="post">
  <button type="submit">اشترك</button>
</form>
```

- For a resource on another site that does not work over HTTPS: move it to your site, or replace it.
- Search your site's template and its pages' content for `http://`: addresses written before the move to HTTPS stay as they were written.
- A `Content-Security-Policy: upgrade-insecure-requests` header has the browser ask for every `http:` address over HTTPS, forms included, but the addresses are still wrong wherever the HTML is read without it, so fix them too.

## FAQ

### My page's images show. Why does it fail?

Because Chrome and Firefox ask for images, video and audio over HTTPS instead of HTTP, so they show if they are there, and vanish if not. Their address in the HTML is still `http:`, and other browsers load them over HTTP and show the page as not secure.

### Is `upgrade-insecure-requests` enough?

It is enough to pass this check: the browser asks for every `http:` address over HTTPS, forms included. Put it in a `Content-Security-Policy` header, or in a `<meta http-equiv="Content-Security-Policy">` in `<head>`, before the elements it upgrades. A `Content-Security-Policy-Report-Only` header upgrades nothing. Fix the addresses themselves too, since they stay wrong wherever the HTML is read without the policy.

### Does the tool check what scripts and stylesheets load?

No. The tool reads the page's HTML as the server sends it, so it does not see what scripts add after loading, nor the addresses inside stylesheets, such as background images in `url()`.

## Methodology

We fetch the page as `ArablyzerBot`, following its redirects, and read the HTML as the server sends it, before any JavaScript runs, together with the response headers. The tool applies to HTTPS pages: we look for elements that load over `http:` and forms that send there, resolving each address as the browser does, including what `<base>` changes, and reading `srcset` as HTML does. We sort each load as browsers treat it under W3C Mixed Content: blocked, asked for over HTTPS instead, or a form that sends without encryption. A script the browser does not fetch, such as `nomodule`, does not count. A page with `upgrade-insecure-requests` in a `Content-Security-Policy` header passes, and so does what comes after a `<meta>` in `<head>` that asks for it. The same page gives the same result on every check.
