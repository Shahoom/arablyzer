---
summary: Does your robots.txt keep Google's crawler away from your page?
---

# robots.txt checker

Reads your site's robots.txt and shows whether Google's crawler may reach your page; if not, which rule blocks it and on which line, and warns you of a server error.

## What it checks

- Whether robots.txt blocks `Googlebot` from the page: we read the group that names it, or the `*` group when there is none, and the longest rule that matches the page's path decides.
- The rule that blocks it and its line in the file, such as a `Disallow: /` left over from the development version after launch.
- Whether robots.txt answers with a server error (5xx) or 429, or cannot be reached, which Google temporarily treats as blocking the whole site.

## Example

### Wrong

```robots.txt
User-agent: *
Disallow: /

Sitemap: https://example.com/sitemap.xml
```

### Right

```robots.txt
User-agent: *
Disallow: /admin/

Sitemap: https://example.com/sitemap.xml
```

## How to fix

Remove the blocking rule, or narrow it to what you really want to block, and leave the rest of the site open to crawling:

```robots.txt
# Blocks only the admin area
User-agent: *
Disallow: /admin/
```

- Make sure `/robots.txt` answers 200, or 404 if you do not need one, and never a 5xx error.
- After the change, check the robots.txt report in Google Search Console.

## FAQ

### Does robots.txt hide a page from search results?

No. robots.txt stops Googlebot from reading the page, but the page can still appear in results as a bare link without a description. To keep a page out of results, use `noindex` and leave the page open to crawling, because Google does not see a `noindex` on a page it may not crawl.

### What if my site has no robots.txt?

That is fine. When `/robots.txt` answers 404, or another 4xx error other than 429, there are no crawling restrictions, and the tool passes. A 5xx error or 429, on the other hand, makes Google temporarily stop crawling the whole site until it can read the file again.

### Does Googlebot follow the `*` rules when it has a group of its own?

No. When a group names Googlebot, it follows that group's rules alone and leaves the `*` group aside; when its group appears more than once in the file, their rules are merged. So Googlebot alone can be blocked while the `*` group looks fine.

## Methodology

We fetch the page as `ArablyzerBot` and follow its redirects, then fetch `/robots.txt` from the origin of its final URL, following at most 5 redirects and reading its first 500 KiB, as Google does. We parse it as RFC 9309 describes, with the tolerance Google documents, such as common misspellings of field names, then apply one rule: we take the Googlebot group or the `*` group, and the longest rule that matches the page's path decides; on a tie, `Allow` wins. A 4xx answer, such as 404, means no restrictions; a 5xx or 429 answer, or a failed connection, means the whole site is blocked. Because we do not fetch the file as Googlebot, if your server or firewall answers Googlebot differently, the result describes what we received. The same file gives the same result on every check.
