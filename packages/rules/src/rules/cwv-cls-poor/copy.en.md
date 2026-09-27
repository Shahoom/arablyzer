# Content that moves while loading on phones

## Messages

### url

On phones, a quarter of real visits to this page saw its content shift by more than {value} while it loaded (the 75th percentile of Cumulative Layout Shift). Google counts more than {limit} as poor. Visits from {first} to {last}.

### origin

On phones, a quarter of real visits to this site's pages saw their content shift by more than {value} while they loaded (the 75th percentile of Cumulative Layout Shift); CrUX has no data for this page alone. Google counts more than {limit} as poor. Visits from {first} to {last}.

## Why it matters

- Content that moves while the page loads makes visitors lose their place in the text, or tap the wrong button.
- Cumulative Layout Shift (CLS) is one of the three Core Web Vitals, which Google's search ranking systems use.
- These are real visits, on real phones: what visitors actually saw move.

## How to fix

- Give images and videos their `width` and `height`, or an `aspect-ratio`, so the browser keeps their space before they load.
- Keep room for what arrives later: banners, ads, embedded content and cookie notices.
- Do not insert content above what is already shown, unless the visitor asked for it.
- Web fonts that change the size of text move it: `font-display: optional`, or a fallback font adjusted with `size-adjust`, keeps it still.

## How we detect

1. With an API key, we ask the Chrome UX Report (CrUX) about the page's URL on phones: data from Chrome users who share usage statistics, over the last 28 days. When it has none for the URL, we ask about the whole site (its origin), and the finding says so.
2. The rule fails when the 75th percentile of Cumulative Layout Shift is over 0.25: Google's limit for poor.
3. Without a key, or when CrUX has no data for the page or its site, as for many sites with fewer visits, the rule does not apply. A page on a local or private address is never sent to Google.
4. CrUX covers the last 28 days, so a fix shows in it gradually, over about four weeks.

## References

- [web.dev: Cumulative Layout Shift](https://web.dev/articles/cls)
- [web.dev: Optimize Cumulative Layout Shift](https://web.dev/articles/optimize-cls)
- [Chrome: the CrUX API](https://developer.chrome.com/docs/crux/api)
- [Google Search Central: Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals)
