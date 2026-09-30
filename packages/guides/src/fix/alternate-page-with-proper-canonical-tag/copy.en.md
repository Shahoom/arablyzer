# “Alternate page with proper canonical tag” in Search Console: what it means and how to fix it

What the Page indexing report means by “Alternate page with proper canonical tag”, why it usually needs no fix, and when it deserves a closer look.

## What it means

- Google sees the page as an alternate version of another page, and the page correctly points to that page as its canonical, which is indexed. Google says there is nothing you need to do.
- The cases Google names: an AMP page with a desktop canonical, a mobile version of a desktop canonical, and the desktop version of a mobile canonical. Search Console does not detect alternate language pages.
- Google says a page marked duplicate or alternate is usually a good thing: it means Google found the canonical page and indexed it.

## Why it shows

The page names another URL as its canonical, with a `<link rel="canonical">` tag, and Google agrees. For example, a mobile version on a URL of its own:

```html
<!-- On the mobile version, https://m.example.com/oud -->
<link rel="canonical" href="https://example.com/oud">

<!-- On the canonical page, https://example.com/oud -->
<link rel="alternate" media="only screen and (max-width: 640px)" href="https://m.example.com/oud">
<link rel="canonical" href="https://example.com/oud">
```

## How to fix

There is usually nothing to fix. Still, check these points:

- Make sure the canonical is the page you expect: in the URL Inspection tool, check the canonical Google selected for the page.
- A page you want in search on its own shows here: its canonical points elsewhere by mistake, which Google says some content management systems and their plugins do. Make the page name itself as its canonical.
- Your site has Arabic and English versions: Search Console does not detect language versions here. Give each version a canonical in its own language, and link the versions with `hreflang` tags.

Then check the page with Arablyzer’s canonical checker, to confirm it gives a single canonical URL that nothing contradicts, and the language codes in its `hreflang` tags with the hreflang checker.

## How to check the fix

- In the URL Inspection tool, the indexed result shows the canonical you declared and the one Google selected. Google determines its choice at indexing time, so the live test cannot show it.
- If you change a canonical, Google sees the change when it crawls the page again. You can request indexing for your most important URLs.

## FAQ

### Should I add noindex to these pages, or delete them?

There is no need. Google does not recommend `noindex` to steer the choice of a canonical within a site, because it blocks the page from Search completely; `rel="canonical"` is the preferred way.

### Why don’t my Arabic and English pages show here?

Search Console does not detect alternate language pages. And Google treats language versions as duplicates only if their main content is in the same language, so an Arabic page and its English translation are not duplicates.

### Can the alternate page still appear in results?

Yes. Google’s results usually point to the canonical page, unless another version suits the searcher better: someone searching on a phone will probably get the mobile page, even when the desktop page is the canonical.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Search Central: What is URL canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization)
- [Google Search Central: How to specify a canonical URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google Search Central: Fix canonicalization issues](https://developers.google.com/search/docs/crawling-indexing/canonicalization-troubleshooting)
- [Search Console Help: URL Inspection tool](https://support.google.com/webmasters/answer/9012289)
