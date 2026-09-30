# Largest Contentful Paint (LCP)

LCP measures loading: the time until the largest image, text block or video in view appears. Good is 2.5 seconds or less; poor is more than 4 seconds.

## Definition

- Largest Contentful Paint reports when the largest image, text block or video visible in the viewport is drawn, counted from the start of the navigation, so it includes redirects, the connection and the server’s first byte.
- It considers `<img>`, `<image>` inside `<svg>`, `<video>`, elements with a background image loaded with `url()`, and block-level elements that contain text.
- The largest element can change as the page loads: the browser reports a new candidate each time a larger one is drawn, and stops at the visitor’s first tap, scroll or key press.
- Good is 2.5 seconds or less and poor is more than 4 seconds, at the 75th percentile of page loads, on phones and desktops separately.

## Why it matters

- It is the loading metric of the Core Web Vitals, which Google’s ranking systems use: the moment the page’s main content appears.
- An image counts only once it has loaded, and text in a web font does not count during the font’s block period. When the largest element is a heading in a web font, such as the Arabic font a site loads, LCP waits for the font, unless `font-display` lets the text show in a fallback font first.

## Example

To see a page’s LCP candidates, paste this into the console of Chrome’s DevTools, as web.dev shows; the last entry logged is usually the page’s LCP:

```js
new PerformanceObserver((entryList) => {
  for (const entry of entryList.getEntries()) {
    console.log('LCP candidate:', entry.startTime, entry);
  }
}).observe({type: 'largest-contentful-paint', buffered: true});
```

## Common mistakes

- Lazy-loading the LCP image with `loading="lazy"`: web.dev says never to, since it always delays it.
- An LCP image the browser cannot find in the HTML: added by JavaScript, hidden in `data-src` by a lazy-loading library, or set as a CSS background. Put it in an `<img>`, or preload it.
- A slow server: nothing can appear before the first byte of the HTML arrives.
- Judging by a test on a fast computer, when visitors come on phones and slower networks.

## References

- [web.dev: Largest Contentful Paint (LCP)](https://web.dev/articles/lcp)
- [web.dev: Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp)
