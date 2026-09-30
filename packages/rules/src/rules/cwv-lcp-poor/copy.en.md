# Slow to show its main content on phones

## Messages

### url

On phones, in a quarter of the visits Chrome recorded to this page, its largest content took {value} s or longer to appear (the 75th percentile). Google counts more than {limit} s as poor. Visits from {first} to {last}.

### origin

On phones, in a quarter of the visits Chrome recorded to this site's pages, their largest content took {value} s or longer to appear (the 75th percentile); CrUX has no data for this page alone. Google counts more than {limit} s as poor. Visits from {first} to {last}.

## Why it matters

- The largest image or block of text is what visitors wait for: until it appears, the page looks empty or unfinished, and many leave.
- Largest Contentful Paint (LCP) is one of the three Core Web Vitals, which Google's search ranking systems use.
- These are real visits, on real phones and networks: what the site's visitors actually waited, not a test in a lab.

## How to fix

- Find the largest element first: Chrome's DevTools mark it in the Performance panel.
- When it is an image: make it smaller (AVIF or WebP, sized for phones), do not lazy-load it, and give it priority with `fetchpriority="high"` or `<link rel="preload" as="image">`.
- Make the server answer sooner: a cache or a content delivery network (CDN) cuts the wait before anything loads.
- Scripts and stylesheets that block the page delay everything: load scripts with `defer`, and keep the CSS the first screen needs small.

## How we detect

1. With an API key, we ask the Chrome UX Report (CrUX) about the page's URL on phones: the last 28 days of visits in Chrome by users who share usage statistics and sync their browsing history. Chrome on iPhone, apps' web views and other browsers are not counted. When CrUX has no data for the URL, we ask about the whole site (its origin), and the finding says so.
2. The rule fails when the 75th percentile of Largest Contentful Paint is over 4 seconds: Google's limit for poor.
3. Without a key, or when CrUX has no data for the page or its site, as for many sites with fewer visits, the rule does not apply. A page on a local or private address is never sent to Google.
4. CrUX covers the last 28 days, so a fix shows in it gradually, over about four weeks.

## References

- [web.dev: Largest Contentful Paint](https://web.dev/articles/lcp)
- [web.dev: Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp)
- [Chrome: the CrUX API](https://developer.chrome.com/docs/crux/api)
- [Chrome: CrUX methodology](https://developer.chrome.com/docs/crux/methodology)
- [Google Search Central: page experience](https://developers.google.com/search/docs/appearance/page-experience)
