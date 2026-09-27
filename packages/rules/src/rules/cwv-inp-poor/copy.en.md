# Slow to answer taps on phones

## Messages

### url

On phones, a quarter of real visits to this page had a tap or key press that took more than {value} ms to show a response on screen (the 75th percentile). Google counts more than {limit} ms as poor. Visits from {first} to {last}.

### origin

On phones, a quarter of real visits to this site's pages had a tap or key press that took more than {value} ms to show a response on screen (the 75th percentile); CrUX has no data for this page alone. Google counts more than {limit} ms as poor. Visits from {first} to {last}.

## Why it matters

- Interaction to Next Paint (INP) measures how long the page takes to show a response after a tap, a click or a key press. Past half a second, the page feels stuck, and visitors tap again or leave.
- It is one of the three Core Web Vitals, which Google's search ranking systems use.
- These are real visits, on real phones: slower phones feel heavy scripts most.

## How to fix

- Long tasks on the page's main thread are the usual cause: split heavy JavaScript work into short parts, so the browser can answer between them.
- Load less JavaScript: third-party scripts, such as chat, analytics and ads, often hold the main thread.
- Keep event handlers short: make the visible change first, and do the rest after it.
- A very large page, with many thousands of elements, makes every update slower.

## How we detect

1. With an API key, we ask the Chrome UX Report (CrUX) about the page's URL on phones: data from Chrome users who share usage statistics, over the last 28 days. When it has none for the URL, we ask about the whole site (its origin), and the finding says so.
2. The rule fails when the 75th percentile of Interaction to Next Paint is over 500 milliseconds: Google's limit for poor.
3. Without a key, or when CrUX has no data for the page or its site, as for many sites with fewer visits, the rule does not apply. A page on a local or private address is never sent to Google.
4. CrUX covers the last 28 days, so a fix shows in it gradually, over about four weeks.

## References

- [web.dev: Interaction to Next Paint](https://web.dev/articles/inp)
- [web.dev: Optimize Interaction to Next Paint](https://web.dev/articles/optimize-inp)
- [Chrome: the CrUX API](https://developer.chrome.com/docs/crux/api)
- [Google Search Central: Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals)
