---
summary: How fast is your page for its real visitors on phones?
---

# Core Web Vitals checker

Reads the Chrome UX Report's data on real visits to your page on phones, and flags each Core Web Vital in Google's poor range: loading (LCP), responsiveness (INP) and visual stability (CLS).

## What it checks

- Largest Contentful Paint (LCP), how long the page's largest content takes to appear: it fails over 4 seconds, Google's limit for poor.
- Interaction to Next Paint (INP), how long the page takes to show a response to a tap, a click or a key press: it fails over 500 milliseconds.
- Cumulative Layout Shift (CLS), how much the page's content moves while it loads: it fails over 0.25.
- Each at the 75th percentile of the last 28 days of visits in Chrome on phones, for the page's URL, or for its whole site when the Chrome UX Report has no data for the page alone.

## Example

### Wrong

```json
{
  "record": {
    "key": {
      "formFactor": "PHONE",
      "url": "https://www.example.com/"
    },
    "metrics": {
      "largest_contentful_paint": {
        "percentiles": {
          "p75": 5200
        }
      },
      "interaction_to_next_paint": {
        "percentiles": {
          "p75": 180
        }
      },
      "cumulative_layout_shift": {
        "percentiles": {
          "p75": "0.05"
        }
      }
    },
    "collectionPeriod": {
      "firstDate": { "year": 2026, "month": 8, "day": 30 },
      "lastDate": { "year": 2026, "month": 9, "day": 26 }
    }
  }
}
```

### Right

```json
{
  "record": {
    "key": {
      "formFactor": "PHONE",
      "url": "https://www.example.com/"
    },
    "metrics": {
      "largest_contentful_paint": {
        "percentiles": {
          "p75": 2100
        }
      },
      "interaction_to_next_paint": {
        "percentiles": {
          "p75": 180
        }
      },
      "cumulative_layout_shift": {
        "percentiles": {
          "p75": "0.05"
        }
      }
    },
    "collectionPeriod": {
      "firstDate": { "year": 2026, "month": 8, "day": 30 },
      "lastDate": { "year": 2026, "month": 9, "day": 26 }
    }
  }
}
```

## How to fix

- LCP: find the largest element (Chrome's DevTools mark it in the Performance panel). When it is an image, make it smaller, do not lazy-load it, and give it priority with `fetchpriority="high"`; make the server answer sooner, and load scripts with `defer`.
- INP: split long JavaScript tasks into short parts, so the browser can answer between them, and load less JavaScript, third-party scripts first.
- CLS: give images and videos their `width` and `height`, or an `aspect-ratio`, and keep room for what arrives later, such as banners, ads and cookie notices.
- The page's main image, with its size and priority, and a script that does not hold the page up:

```html
<img src="/images/oud.avif" width="1200" height="800" fetchpriority="high" alt="بخور العود الملكي">
<script src="/js/app.js" defer></script>
```

- The data covers the last 28 days, so a fix shows in it gradually, over about four weeks.

## FAQ

### Where does the data come from?

From the Chrome UX Report (CrUX), which Google publishes: visits in Chrome by users who share usage statistics and sync their browsing history. Chrome on iPhone, apps' web views and other browsers are not counted. The check asks CrUX's API about your page's URL with a key, so the URL is sent to Google; a page on a local or private address never is.

### Why does the check say it does not apply?

The Chrome UX Report has no data for the page or its site, as for many sites with fewer visits, or the check was run without an API key.

### My page is not in the poor range. Does it pass the Core Web Vitals?

Not necessarily: the check fails only Google's poor range. Google counts an experience as good at the 75th percentile when LCP is 2.5 seconds or less, INP 200 milliseconds or less and CLS 0.1 or less, and a page passes the Core Web Vitals when all three are good. Values between good and poor need improvement.

### Does it show desktop visits?

No. The check asks the Chrome UX Report about visits on phones alone.

## Methodology

With an API key, we ask the Chrome UX Report API about the page's URL on phones, and about its origin when the URL has no data, and read the 75th percentile of each of the three metrics over the last 28 days. A metric fails when it is in Google's poor range: LCP over 4 seconds, INP over 500 milliseconds, CLS over 0.25. Without a key, or without data, the check does not apply, and says why. The data moves with the 28 days it covers: the same answer always gives the same result, but the answer changes from day to day.
