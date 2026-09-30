# Core Web Vitals

Core Web Vitals are Google’s three metrics of real visitors’ experience of a page: loading (LCP), responsiveness (INP) and visual stability (CLS).

## Definition

- Core Web Vitals are the part of Google’s Web Vitals initiative that applies to all web pages, that every site owner should measure, and that Google’s tools report.
- The current set is Largest Contentful Paint (LCP) for loading, Interaction to Next Paint (INP) for responsiveness, and Cumulative Layout Shift (CLS) for visual stability. INP replaced First Input Delay (FID) in 2024.
- Each has thresholds, judged at the 75th percentile of page loads, on phones and desktops separately:

| Metric | Good | Poor |
|---|---|---|
| LCP | 2.5 seconds or less | more than 4 seconds |
| INP | 200 milliseconds or less | more than 500 milliseconds |
| CLS | 0.1 or less | more than 0.25 |

A value between the two needs improvement. A page passes when all three are good at the 75th percentile.

## Why it matters

- Google’s ranking systems use Core Web Vitals, but good scores do not guarantee a top position: Google still shows the most relevant content, even when its page experience is weaker.
- They are field metrics, recorded from real visitors on their own devices and networks. Lab tools such as Lighthouse cannot measure INP, since no one interacts; web.dev suggests Total Blocking Time (TBT) in its place.
- The field data in PageSpeed Insights and Search Console’s Core Web Vitals report comes from the Chrome UX Report (CrUX), which Arablyzer’s rules also read, for phones.

## Example

Measuring all three on your own pages with the `web-vitals` library, the easiest way according to web.dev:

```js
import {onCLS, onINP, onLCP} from 'web-vitals';

function send(metric) {
  navigator.sendBeacon('/analytics', JSON.stringify(metric));
}

onCLS(send);
onINP(send);
onLCP(send);
```

## Common mistakes

- Judging a page by one lab test, which can differ from what visitors live through and cannot measure INP.
- Reading an average rather than the 75th percentile, or mixing phones with desktops.

## References

- [web.dev: Web Vitals](https://web.dev/articles/vitals)
- [Google Search Central: Understanding Core Web Vitals and Google search results](https://developers.google.com/search/docs/appearance/core-web-vitals)
- [Google Search Central: Understanding page experience in Google Search results](https://developers.google.com/search/docs/appearance/page-experience)
