# “Indexed, though blocked by robots.txt” in Search Console: what it means and how to fix it

What the Page indexing report means by “Indexed, though blocked by robots.txt”: why Google indexes a page it does not crawl, and how to fix it for each case.

## What it means

- Google indexed the page’s URL even though your robots.txt file stops it from crawling the page.
- Google does not request or crawl the blocked page, but it can still index it using information from the pages that link to it.
- Because of that, Google says any snippet shown for the page in search results will probably be very limited.
- The message sits in the “Warning” group: it does not prevent the page from being indexed, but it reduces Google’s ability to understand it.

## Why it shows

robots.txt controls crawling, not indexing. Google warns against using it to hide pages from search results: if other pages point to yours with descriptive text, Google could still index the URL without visiting the page.

So the message means the page is disallowed in robots.txt and a link to it reached Google from somewhere else, from your own site or another.

## How to fix

The fix depends on what you want for the page:

- **You want it in search results:** remove the rule that blocks it from robots.txt, or narrow the rule so it no longer matches this page. The robots.txt tester shows which rule blocks it.
- **You do not want it in search results:** remove the rule from robots.txt **and add `noindex`** to the page. Google says robots.txt is not the right mechanism to avoid indexing.

```txt
# Before: blocks crawling, so Google never sees a noindex tag on the page
User-agent: *
Disallow: /offers/

# After: nothing blocked, and the page itself carries noindex
User-agent: *
Disallow:
```

```html
<meta name="robots" content="noindex" />
```

Or send the `X-Robots-Tag: noindex` header with the page’s response, which also works for files that are not HTML, such as PDFs.

The order matters: for `noindex` to work, Google requires that the page is not blocked in robots.txt. Otherwise the crawler never sees the tag or the header, and the page can still appear in results, for example when other pages link to it. If the page is truly private, protect it with a password, which Google recommends alongside `noindex`.

## How to check the fix

- Open the [robots.txt checker](/tools/robots-check) and confirm Googlebot is no longer blocked from the URL, and use the [indexability checker](/tools/indexability-check) if you added `noindex`.
- In Search Console, open the URL Inspection tool, test the live URL, and check that `noindex` is detected if you want the page left out.
- Then choose “Validate fix” in the Page indexing report. The page leaves the index only after Google crawls it again, so do not expect it to be instant.

## FAQ

### Does robots.txt keep a page out of the index?

No. It only stops crawling. Google says a blocked page can still have its URL shown in results, with a limited snippet, if Google finds information about it on other pages.

### Do I have to fix this message?

It depends on the page. If you want the page to appear, remove the block. If you hide it on purpose, such as account or cart pages, add `noindex` and do not rely on robots.txt alone.

### I removed the block and added noindex, so why is the page still showing?

Google has not been back to the page yet. It has to crawl the page to read `noindex`. You can request indexing from the URL Inspection tool to speed that up.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Search Central: Introduction to robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
- [Google Search Central: Block Search indexing with noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
