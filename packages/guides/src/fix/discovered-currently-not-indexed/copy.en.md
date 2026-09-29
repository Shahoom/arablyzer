# “Discovered - currently not indexed” in Search Console: what it means and how to fix it

What the Page indexing report means by “Discovered - currently not indexed”, why Google puts off crawling, and how to help it reach your pages.

## What it means

- Google found the URL but has not crawled it yet, so it has not indexed the page, and the page does not show in search results.
- Google says that typically it wanted to crawl the URL but expected this to overload the site, so it rescheduled the crawl. That is why the report shows no last crawl date.
- On a new site, it can be a matter of time: Google says that once it knows the URLs, it can take some time, up to a few weeks, before it crawls some or all of a site.

## Why it shows

Google can give each site only so much crawling time and resources, and two things decide how much:

- What your server can take: Google sets a crawl capacity limit so it does not overwhelm your server. The limit goes down when the site slows down, or answers with server errors (`5xx`) or rate-limiting signals such as `429`.
- What Google wants to crawl: Google tries to crawl all or most of the URLs it knows on your site. If many of them are duplicates or unimportant, such as differently sorted versions of the same page, crawling time goes to waste on them. How popular the URLs are, and how often they need refreshing, count too.

Google’s crawl budget guide is written for large sites, and for sites with a large share of their URLs in this status.

## How to fix

- Check your server’s health in the Crawl Stats report, in the property settings in Search Console: its host status shows whether Google met availability problems on your site. Fix slow responses, server errors and `429` answers.
- Consolidate duplicate pages, with a canonical URL or a redirect, so Google crawls unique content rather than many URLs.
- Block in robots.txt the URLs you do not want crawled at all, such as sorted versions of a page, if you cannot consolidate them. Then check with Arablyzer’s indexability checker that the new rules do not block pages you want in search.
- Answer with `404` or `410` for pages removed for good, fix soft 404 pages, and avoid long redirect chains.
- Keep your sitemap up to date, with `<lastmod>` for the pages you update.
- Do not use `noindex` to save crawling: Google still requests the page, then drops it when it sees the rule, and the time is wasted.

## How to check the fix

- In the URL Inspection tool, the date of the last crawl shows once Google crawls the page. The live test does not cover this status.
- In the Crawl Stats report, follow the host status and the number of crawl requests over time.
- For a few important URLs, request indexing in the URL Inspection tool; for many, submit a sitemap.

## FAQ

### My site is small. Why does this message show?

Google says it can take a week or so for it to start crawling and indexing a new page or site, so wait a few days. It also says a site with fewer than 500 pages probably does not need the Page indexing report. Instead, search Google for something like `site:example.com` to see whether your key pages are indexed.

### Does requesting indexing help?

For a few important URLs, yes: request indexing in the URL Inspection tool, though requests have a daily limit. For many URLs, Google recommends submitting a sitemap. Requesting indexing does not guarantee that the page gets indexed.

### Should I block pages in robots.txt so Google crawls others?

Block only the pages you do not want crawled at all. Google says robots.txt is not a way to move crawl budget to other pages for a while: Google does not shift the freed budget to other pages unless it is already hitting your site’s crawl capacity limit.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Crawling Infrastructure: Optimize your crawl budget](https://developers.google.com/crawling/docs/crawl-budget)
- [Search Console Help: Crawl Stats report](https://support.google.com/webmasters/answer/9679690)
- [Search Console Help: URL Inspection tool](https://support.google.com/webmasters/answer/9012289)
