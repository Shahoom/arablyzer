---
summary: Does the page, or your robots.txt, keep it out of search results?
---

# Indexability checker

Checks that Google can crawl and index your page: no noindex in a meta tag or X-Robots-Tag header, no robots.txt block on Googlebot, and no conflicting canonical URLs.

## What it checks

- Whether the page asks not to be indexed: `noindex` or `none` in a `<meta name="robots">` or `<meta name="googlebot">` tag, or in the `X-Robots-Tag` header.
- Whether the page gives more than one different canonical URL, in `<link rel="canonical">` tags or the `Link` header, in which case Google may ignore them all and choose the original itself.
- Whether robots.txt blocks `Googlebot` from the page, or answers with a server error (5xx) or 429, which Google temporarily treats as blocking the whole site.

## Example

### Wrong

```robots.txt
User-agent: *
Disallow: /admin/

User-agent: Googlebot
Disallow: /
```

### Right

```robots.txt
User-agent: *
Disallow: /admin/
```

## How to fix

Remove `noindex` and `none` where they come from, a tag or a header:

```html
<!-- Remove this tag, or keep only its other rules -->
<meta name="robots" content="noindex, follow" />
```

- When they come from the `X-Robots-Tag` header, look in the server configuration: `Header set X-Robots-Tag` in Apache, `add_header X-Robots-Tag` in nginx, or your CDN's settings.
- In WordPress, untick "Discourage search engines from indexing this site" under "Settings → Reading", and check the SEO plugin's settings for the page itself.
- Remove the robots.txt rule that blocks Googlebot, or narrow it to what you really want to block, and check the group that names Googlebot if there is one: it follows that group alone and leaves the `*` group aside.
- Keep a single canonical URL, as a full URL, from a single source: the theme, the SEO plugin or the `Link` header.

## FAQ

### What is the difference between `noindex` and blocking the page in robots.txt?

`noindex` asks Google not to show the page in results, and Google only sees it when it reads the page. robots.txt stops Googlebot from reading the page, which can still appear in results as a bare link without a description. To hide a page, use `noindex` and leave the page open to crawling; if you also block it in robots.txt, Google does not see the `noindex`.

### Is `noindex` always a mistake?

No. If you mean to hide the page, such as a "thank you for your order" page or internal search results, this finding needs no fix. The problem is a `noindex` on pages you want in search, left over from the development version or added by a content-management setting.

### Does a pass mean Google will index the page?

No. The tool checks that the page does not ask to stay out of the index, that robots.txt does not block it, and that it gives no conflicting canonical URLs; indexing itself is Google's decision. The URL Inspection tool in Google Search Console shows the page's status at Google.

## Methodology

We fetch the page as `ArablyzerBot`, follow its redirects, and read its headers and HTML as the server sends them, before any JavaScript runs, then fetch `/robots.txt` from the origin of its final URL. We apply three rules. The first looks for `noindex` and `none` in `<meta>` tags named `robots` or `googlebot` and in every `X-Robots-Tag` header, ignoring rules aimed at crawlers other than Googlebot. The second collects canonical URLs from `<head>` and from `Link` headers, turns them into full URLs and compares them; these two apply only when the page answers with a 2xx status. The third reads robots.txt as RFC 9309 describes, with the tolerance Google documents: it takes the Googlebot group or the `*` group, and the longest rule that matches the page's path decides. Because we fetch nothing as Googlebot, if your server answers Googlebot differently, the result describes what we received. The same page gives the same result on every check.
