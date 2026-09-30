# Indexing

Indexing is how Google analyzes a page after crawling it and stores what it understood in its index. A page that is not indexed cannot show in search results.

## Definition

- After crawling a page, Google tries to understand what it is about: it analyzes its text, its key tags and attributes, such as `<title>` and `alt` attributes, and its images and videos. This stage is indexing.
- During indexing, Google groups similar pages and picks the most representative one as the canonical; what it collects may be stored in the Google index, a large database. Indexing is not guaranteed.

## Why it matters

- A page that is not indexed does not show in search results. Among the reasons Google gives: low-quality content, robots `meta` rules that disallow indexing, and a site design that makes indexing difficult.
- Not every URL needs to be indexed: a URL can stay out for a good reason, such as an intended robots.txt rule, a `noindex`, a duplicate, or a removed page that answers `404`.
- A translated page is not a duplicate of the original. Country versions with the same Arabic text, such as pages for Saudi Arabia and the UAE, are: for those, Google recommends a preferred version with `rel="canonical"`, and `hreflang` so each searcher gets their country's URL.

## Example

Two messages in Search Console's Page indexing report tell crawling and indexing apart:

- "Discovered - currently not indexed": Google found the URL but has not crawled it yet, typically because it expected the crawl to overload the site and rescheduled it.
- "Crawled - currently not indexed": Google crawled the page but did not index it; it may or may not later, and there is no need to resubmit it.

## Common mistakes

- Expecting every URL to be indexed: some are duplicates or carry no useful information.
- Blocking a page in robots.txt to take it out of the index: its URL can still be indexed, and the right way is `noindex` on a page left open to crawling.
- Arabic and English side by side on one page: Google detects a page's language from its visible content, not from `lang` or the URL, so keep one language per page.

## References

- [Google Search Central: In-depth guide to how Google Search works](https://developers.google.com/search/docs/fundamentals/how-search-works)
- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Search Central: Tell Google about localized versions of your page](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google Search Central: Managing multi-regional and multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Google Search Central: Introduction to robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
