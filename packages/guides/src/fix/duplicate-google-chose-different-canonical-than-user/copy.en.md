# “Duplicate, Google chose different canonical than user” in Search Console: what it means and how to fix it

What the Page indexing report means by “Duplicate, Google chose different canonical than user”, why Google overrides your choice, and what to check.

## What it means

- The page is marked as the canonical of a set of pages, but Google thinks another URL makes a better canonical, and indexed that URL instead of this one.
- A canonical you declare is a hint, not a rule: Google may choose a different page, for various reasons.
- Google explains that it sees the page as a duplicate of the canonical it selected, not of the one you declared. It will never choose a canonical that is not similar to the page.

## Why it shows

Google chooses the canonical from signals, among them redirects, `rel="canonical"` tags, sitemaps, a preference for `https` over `http`, and URLs in `hreflang` groups. It may choose differently for reasons such as the quality of the content, or technical signals that disagree or point to another URL. Among the causes Google mentions:

- An incorrect canonical: some content management systems and their plugins point canonical tags or redirects to unwanted URLs.
- Conflicting signals: one URL in the sitemap and another in the tag, for the same page.
- HTTPS problems: Google prefers the `https` version, but an invalid certificate or a redirect to `http` pushes it to the `http` one.
- Language versions without `hreflang`: nearly identical content for different regions, without tags saying which version is for whom.
- A misconfigured server, a hacked site with an injected redirect or canonical to another domain, or, rarely, a site that copies your content.

## How to fix

1. In the URL Inspection tool, compare the canonical you declared with the one Google selected, then open the page and both URLs in your browser.
2. Ask whether Google’s choice makes more sense for visitors coming from Search. If it does, you can leave it.
3. If not, make every signal name the same URL: the canonical tag on the copies and on the canonical page itself, the sitemap, internal links, `hreflang` links, and permanent redirects for the copies you retire.
4. If the pages are meant to be separate, make the difference between their content clear and significant.
5. If you find a redirect or a canonical to another domain that you did not add, check the site for hacking.

Arablyzer’s canonical checker catches one cause of conflicting signals: two tags pointing to different URLs, or a `Link` header that contradicts the tag.

## How to check the fix

- Google determines its choice at indexing time, so the live test cannot show it. After Google crawls the page again, check the indexed result in the URL Inspection tool.
- Google might keep pages grouped as duplicates for up to two weeks after you fix their content. Request indexing only for your most important URLs, since requests are limited.

## FAQ

### Doesn’t Google have to follow my canonical tag?

No. Google calls it a hint, not a rule, and says it may choose a different page for various reasons, such as the quality of the content or technical signals.

### Why did Google choose the http version of my page?

Google prefers `https` pages as canonical, unless the page has an invalid certificate, loads insecure resources other than images, redirects to `http`, or names the `http` page as its canonical. Google also advises against listing the `http` version in your sitemap or `hreflang` tags.

### Does it matter which URL Google chooses?

Google uses the canonical page as the main source to evaluate content and quality, and its results usually point to it. And if the URL it chose is in a Search Console property you do not own, you will not see the traffic of your duplicate page.

## References

- [Search Console Help: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google Search Central: Fix canonicalization issues](https://developers.google.com/search/docs/crawling-indexing/canonicalization-troubleshooting)
- [Google Search Central: How to specify a canonical URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google Search Central: What is URL canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization)
- [Search Console Help: URL Inspection tool](https://support.google.com/webmasters/answer/9012289)
