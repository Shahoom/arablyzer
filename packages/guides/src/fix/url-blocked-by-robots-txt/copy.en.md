# “URL blocked by robots.txt” in Search Console: what it means and how to fix it

What the Page indexing report means by “URL blocked by robots.txt”, how to find the rule that blocks Googlebot, and how to fix it when you want the page in search.

## What it means

- Your site’s robots.txt has a rule that stops Googlebot from crawling this URL, so Google did not read the page and did not index it.
- If you meant to block crawling, such as an admin area or internal search results, the message means the file works as you intended, and Google says such URLs are probably blocked on purpose.
- The problem is the message on pages you want in search results.

## Why it shows

The robots.txt file sits at the root of the site (`/robots.txt`). Googlebot takes the group of rules that names it, or the `*` group when there is none, and the longest rule that matches the URL’s path decides. Causes of an unintended block:

- A `Disallow: /` left over from the development site after launch, blocking the whole site.
- A rule wider than you think: a rule’s path matches every URL that starts with it, so `Disallow: /ar` blocks both `/ar/` and `/archive`.
- A group that names `Googlebot` with a block in it: Googlebot follows that group alone, and leaves aside the `*` group, which looks fine.
- The rule is in another file than the one you checked: each host, protocol and port has its own file, so a page on `shop.example.com` follows `shop.example.com/robots.txt`.

## How to fix

Remove the rule that blocks the page, or narrow it to what you really want to block:

```robots.txt
User-agent: *
# Was Disallow: /ar, which blocked every path starting with /ar
Disallow: /ar/drafts/
```

- If your content management system or an SEO plugin generates the file, change it in their settings; some hosted platforms do not let you edit it directly.
- Check every group that names `Googlebot`, not only the `*` group.
- Save the file as UTF-8, and upload it to the site’s root as `robots.txt`.
- If you want the page out of search results rather than uncrawled, do not use robots.txt: use `noindex` and leave the page open to crawling.

## How to check the fix

- Check the page with Arablyzer’s robots.txt checker: it reads the file and shows whether it blocks Googlebot from the page, with the rule and its line. To check the page’s own `noindex` as well, use the indexability checker.
- In Search Console, open the robots.txt report to see the version Google fetched, and request a recrawl of the file; otherwise Google refreshes its cached copy every 24 hours.
- Open the URL Inspection tool and test the live URL, to see whether crawling is still blocked.
- Then request indexing from the same tool, and choose “Validate fix” in the Page indexing report.

## FAQ

### Is blocking a page in robots.txt enough to hide it from search results?

No. robots.txt stops Google from reading the page, not from indexing its URL: the URL can still show in results without a description if other pages link to it. To hide a page, remove its robots.txt block and add `noindex`, because Google does not see a `noindex` on a page it may not crawl.

### What is the difference between this message and “Indexed, though blocked by robots.txt”?

The other message is a warning, not an error: Google indexed the URL despite the block because other pages link to it, using their information without crawling the page, and its snippet in results is probably very limited. If you want the page in search, remove the block; if you do not, remove the block and add `noindex`.

### How do I write Arabic paths in robots.txt?

As they are or percent-encoded: Google treats both the same, because it converts a rule’s path to its percent-encoded form before comparing it with URLs, so `Disallow: /تصنيف/` equals `Disallow: /%D8%AA%D8%B5%D9%86%D9%8A%D9%81/`. What matters is saving the file as UTF-8, because Google may ignore characters outside it, which can break the rule.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Search Central: Introduction to robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
- [Google Crawling Infrastructure: How Google interprets the robots.txt specification](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)
- [Google Crawling Infrastructure: Update your robots.txt file](https://developers.google.com/crawling/docs/robots-txt/submit-updated-robots-txt)
- [Search Console Help: robots.txt report](https://support.google.com/webmasters/answer/6062598)
