# “Crawled - currently not indexed” in Search Console: what it means and how to fix it

What the Page indexing report means by “Crawled - currently not indexed”, when it needs action, and what Google says about the pages it indexes.

## What it means

- Google crawled the page but did not index it, so it does not show in search results. Google says the page may or may not be indexed in the future, and that there is no need to resubmit the URL for crawling.
- The message is not necessarily an error: Google does not index every page it crawls, since after crawling each page is assessed to decide whether it suits the index. And Google does not guarantee to index any page.
- The message matters for pages you want people to find. Google says not to expect every URL on your site to be indexed, only the canonical pages.

## Why it shows

Google does not give the reason for its decision on each page. What it says about indexing in general:

- Indexing depends on the page’s content and metadata, and the common issues Google lists include low-quality content and a site design that makes indexing difficult.
- To be indexed, a page must not be a duplicate of another indexed page: it must be unique, or the canonical of a set of similar pages.
- Google does not index pages that are inappropriate to index, such as versions of a page with different filters applied.
- Google’s systems prioritize the fast inclusion of high-quality, useful content.

## How to fix

First decide whether you need the page in search: a filtered version of a category page, for example, may be better left out. If you do:

- Check the page with Arablyzer’s indexability checker: it confirms nothing asks Google to keep the page out of the index, robots.txt does not block it, and it gives no conflicting canonical URLs.
- If the page resembles another page on your site, choose one of them as the canonical, or make the content of each clearly different.
- Improve the page itself. Among the questions Google suggests for judging content: does it offer original information and a complete description of its topic, and does the main heading or page title give a descriptive, helpful summary of it? Arablyzer’s title and meta description checker and H1 heading checker confirm the page has a title (`<title>`) and a description, and a main heading (`<h1>`) with text.
- Link to the page from your site’s navigation: Google says that, starting from your home page, it should be able to index all the other pages on your site if the navigation is comprehensive and properly implemented.
- After a substantial change to the page, request indexing once in the URL Inspection tool.

## How to check the fix

- In the URL Inspection tool, the indexed result shows whether the URL is on Google, and when Google last crawled it. The live test does not cover this status, so it cannot tell you whether Google will index the page.
- Google says crawling can take anywhere from a few days to a few weeks, and that requesting it does not guarantee inclusion in its results. Check the page’s status again after that.

## FAQ

### Should I request indexing again and again?

No. Google says there is no need to resubmit the URL, and that requesting a crawl of the same URL many times does not get it crawled any faster. Indexing requests in the URL Inspection tool also have a daily limit.

### Can anything guarantee that the page gets indexed?

No. Google says it does not guarantee to crawl, index or serve a page, even one that follows Google Search Essentials, and that requesting a crawl does not guarantee inclusion in its results.

### How is it different from “Discovered - currently not indexed”?

In that message, Google found the URL but has not crawled it yet, which is why the report shows no last crawl date. Here Google has crawled the page, and has not indexed it.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Search Console Help: URL Inspection tool](https://support.google.com/webmasters/answer/9012289)
- [Google Search Central: In-depth guide to how Google Search works](https://developers.google.com/search/docs/fundamentals/how-search-works)
- [Google Search Central: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google Search Central: Ask Google to recrawl your URLs](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [Google Crawling Infrastructure: Optimize your crawl budget](https://developers.google.com/crawling/docs/crawl-budget)
