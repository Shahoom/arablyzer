---
summary: Write redirects for Apache, nginx, Cloudflare Pages, Netlify or Vercel from a list.
---

# Redirect generator

Paste a list of redirects, the old address then the new on each line, choose your server and the status code, and get the config: Apache `.htaccess`, nginx, a `_redirects` file (Cloudflare Pages and Netlify) or Vercel's `vercel.json`. Chains are flattened first, and Arabic paths are written the way each server reads them.

## What it checks

- Chains are turned into one hop, and loops, clashes and repeated lines are left out and named.
- The status code you choose: 301 or 308 for a permanent move, 302 or 307 for a temporary one.
- Arabic paths: decoded for Apache and nginx, which read the decoded path, and percent-encoded for the `_redirects` file and `vercel.json`; targets are always encoded.
- Nothing that could end a line or a block in the config goes in: a source with a space, a quote, a bracket, a semicolon, a query or a star is refused.
- The example on this page is the exchange a crawler meets: a temporary redirect (302) on a move that is for good, from example.com to www.example.com, and the permanent one (301) it should be.

## Example

### Wrong

```http
HTTP/1.1 302 Found
Location: https://www.example.com/

HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

### Right

```http
HTTP/1.1 301 Moved Permanently
Location: https://www.example.com/

HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

## How to fix

Put the config where your server reads it, then request an old address and look at the answer:

```text
RedirectMatch 301 "^/old-page/?$" "/new-page"
```

- Use 301 (or 308) for a page that has moved for good, and 302 (or 307) only for a move you will undo.
- Send each address to the page that replaces it, and update your links and sitemap to the new addresses.
- Test on a staging copy first: a wrong pattern can redirect more than you meant.
- Apache `RedirectMatch` matches an exact path; nginx `location =` too. Neither sees a query string: a redirect that depends on a query needs a rewrite rule written by hand.

## FAQ

### Which server do I have?

A shared host with cPanel is usually Apache (`.htaccess`). A VPS is often nginx. Cloudflare Pages and Netlify read a `_redirects` file; Vercel reads `vercel.json`. A platform such as Salla, Zid or Shopify has its own redirect screen in its dashboard and takes no file.

### 301 or 308?

Both are permanent. 308 keeps the request’s method (a POST stays a POST), 301 may turn it into a GET. For pages people open, 301 is the usual choice.

### Does what I type reach Arablyzer?

No. The generator runs in your browser, and nothing you type leaves it.

## Methodology

The generator runs in your browser, with the same planner as the redirect planner. Apache directives are `RedirectMatch` with the path escaped for a regular expression; nginx uses `location =`; the `_redirects` file is the format Cloudflare Pages and Netlify document; Vercel’s is the `redirects` array of `vercel.json` with `statusCode`. We cannot test your server: try an old address after you deploy.
