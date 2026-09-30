# “URL marked 'noindex'” in Search Console: what it means and how to fix it

What the Page indexing report means by “URL marked 'noindex'”, where the noindex comes from, and how to remove it when you want the page in Google’s results.

## What it means

- When Google tried to index the page, it found a `noindex` rule in it, so it did not add the page to its index: the page stays out of search results as long as the rule is there.
- If you do not want the page in results, such as an order confirmation page or internal search results, the message means everything works as you intended, and there is nothing to fix.
- The problem is the message on pages you want in search.

## Why it shows

The rule lives in one of two places:

- A tag in the page’s `<head>`: `<meta name="robots" content="noindex">`, or `<meta name="googlebot" content="noindex">` for Google alone.
- A header in the server’s response: `X-Robots-Tag: noindex`, which server or content delivery network (CDN) settings can add without it showing in the page’s code.

Common causes:

- A setting left over from the development site after launch, such as WordPress’s option to discourage search engines from indexing the site (Settings → Reading).
- A setting for that page in an SEO plugin or in the store’s dashboard.
- A script that adds `noindex` after the page loads, or tries to remove it: Google says it may skip running JavaScript on a page whose original code has `noindex`, so removing the rule with JavaScript may not work.

## How to fix

Remove the rule where it comes from:

```html
<!-- Remove this tag, or make its content index -->
<meta name="robots" content="noindex">
```

- If it comes from an `X-Robots-Tag` header, look in the server’s settings: `Header set X-Robots-Tag` in Apache, `add_header X-Robots-Tag` in nginx, and the header rules of your CDN.
- In WordPress, clear the option that discourages search engines (Settings → Reading), and check the page’s indexing setting in your SEO plugin.
- Do not also block the page in robots.txt: Google needs to read the page to see the rule is gone.

## How to check the fix

- Check the page with Arablyzer’s indexability checker: it reads the `robots` and `googlebot` tags and the `X-Robots-Tag` headers as the server sends them.
- In Search Console, open the URL Inspection tool and test the live URL, to see whether Google still finds `noindex`.
- Then request indexing from the same tool, and choose “Validate fix” in the Page indexing report, so Google checks the affected pages again.

## FAQ

### How long until the page shows after removing noindex?

Google gives no set time: it sees the change when it crawls the page again, which it says may take months for some pages, depending on their importance. Requesting indexing in the URL Inspection tool asks it to crawl the page again.

### Why is blocking the page in robots.txt not enough to hide it?

Because robots.txt stops Google from reading the page, not from indexing its URL: the page can still show in results without a description if other pages link to it. To keep a page out of results, use `noindex` and leave the page open to crawling.

### Does noindex affect the links on the page?

`noindex` keeps the page itself out of the index. Not following its links is another rule, `nofollow`, sometimes written with it, as in `noindex, nofollow`.

## References

- [Google Search Central: Block Search indexing with noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Search Console Help: URL Inspection tool](https://support.google.com/webmasters/answer/9012289)
- [Google Search Central: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
