# “Not found (404)” in Search Console: what it means and how to fix it

What the Page indexing report means by “Not found (404)”, when to leave it as it is, and when to fix the link or redirect it to where the content moved.

## What it means

- When Googlebot requested the URL, the server answered `404`, so Google does not index it, and removes it from the index if it was indexed before.
- Google found the URL without you asking it to index it or listing it in a sitemap: maybe through a link on another page, or because the page existed and was deleted.
- The message is not necessarily a problem: if you deleted the page and it has no replacement, `404` is the right answer, and Google says 404 errors generally do not affect your site’s search performance.

## Why it shows

- A page was deleted, or moved to a new URL without a redirect.
- A change in URL structure, such as moving to a new platform or changing the URL format, without redirecting the old URLs to the new ones.
- A link in your pages with a typo, or an old link left in the menu or in articles.
- A wrong link on another site, or a URL visitors mistype in the browser.

## How to fix

The decision depends on the URL:

- The content moved to a new URL: redirect the old URL to the new one with a `301`.
- The page was deleted and has no replacement: let it answer `404` or `410`. Do not redirect it to the home page, fill it with placeholder content, or block it in robots.txt.
- The URL is in your pages or your sitemap: fix it or remove it. Google generally recommends fixing only the 404 errors your own links or your sitemap point to.
- A URL that is often mistyped: redirect it to the right page.

A permanent redirect in Apache, from Google’s examples; in nginx, `return 301` does the same:

```apache
# The content moved: permanent redirect to its new URL
Redirect permanent "/old" "https://example.com/new"
```

## How to check the fix

- Request the old URL with `curl -I`: a moved one should answer `301` with a `Location` header holding the new page’s URL, and a deleted one `404` or `410`.
- In Search Console, open the URL Inspection tool, test the live new URL, then request indexing.
- If you fixed links or added redirects, choose “Validate fix” in the Page indexing report. Pages you deleted on purpose do not need it: the report only shows URLs that returned `404` in the past month.

## FAQ

### Do 404 errors hurt my site’s ranking?

Usually not. Google says 404 errors do not harm your site’s indexing or ranking, and that you can ignore them if you are sure the URLs should not exist. What matters is that URLs that do not exist answer with a real `404`.

### Why does Googlebot keep coming back to a URL I deleted?

Googlebot keeps trying the URL for some time, and there is no way to make it forget a URL for good, but it crawls it less and less often. The report only shows URLs that returned `404` in the past month, so the deleted URL leaves it over time.

### Should I use `410` instead of `404`?

`410` says outright that the removal is permanent, while `404` does not say whether the absence is temporary or permanent. But Google currently treats `410` the same as `404`, so either works for it.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Search Console Help: 404 errors](https://support.google.com/webmasters/answer/2445990)
- [Google Search Central: Redirects and Google Search](https://developers.google.com/search/docs/crawling-indexing/301-redirects)
- [Google Crawling Infrastructure: How HTTP status codes affect Google’s crawlers](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)
- [MDN: 410 Gone](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/410)
