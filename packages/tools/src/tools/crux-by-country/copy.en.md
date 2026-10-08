---
summary: How do visitors in nine Arab countries experience your site's speed? Real Chrome data.
---

# Each country's lens: Chrome data by Arab country

Reads the real Chrome visitors' data for your site in nine Arab countries, and shows for each the share of good visits in loading speed, responsiveness and layout stability, and your site's popularity rank there.

## What it checks

- LCP, INP and CLS for your visitors' phones in Saudi Arabia, the UAE, Egypt, Kuwait, Qatar, Bahrain, Oman, Jordan and Morocco.
- The share of good visits (LCP up to 2.5 s, INP up to 200 ms, CLS up to 0.1) for the latest month whose tables are published.
- The origin's popularity rank in each country.
- From the Chrome UX Report tables in BigQuery, because the usual CrUX API has no country dimension.
- It runs when the server's operator has put in a service account and a project to pay for the query; without them it says it is off.

## Example

### Wrong

```html
<p>يبطؤ موقعنا عند الزوار في بعض الدول.</p>
```

### Right

```html
<p>يسرع موقعنا عند الزوار في كل الدول.</p>
```

## How to fix

- Start with the worst country and test the page on a network and phone like theirs.
- Bring your server closer to your visitors with a CDN that has points of presence in the region.
- Cut the size of images, fonts and scripts, and fix the dimensions of images and ads.
- See the «Core Web Vitals» check for the detail of each metric.

```html
<img src="hero.jpg" width="800" height="450" alt="منتجاتنا" fetchpriority="high" />
```

## FAQ

### Why is the usual CrUX API not enough?

Because it gives the page's or the origin's figures for the whole world and does not separate countries. Your site may be fast for most visitors and slow in one country, and the difference is lost in the average.

### What does each check cost?

The server's operator pays Google Cloud, not you. The query reads nine countries' tables for one month, and before it we run a free dry run that tells us how much it would read, and we do not run it if that is over the cap (20 GB by default); BigQuery itself refuses to bill more than the cap. The bytes BigQuery really billed show on the result; and the result is kept for a day so the query is not repeated.

### Why is there no data for me in some countries?

Because a country's CrUX table includes the origins that have enough visits from Chrome users there. An origin with few visitors in a country does not appear.

## Methodology

We query by origin (the domain with its protocol) for the phone histograms of LCP, INP and CLS in `chrome-ux-report.country_<cc>.<yyyymm>` for the nine countries, for the latest month whose tables exist, compute the share of density in the bins that end at or under the good threshold, and ask the popularity rank in a second query. The queries use named parameters and a `maximumBytesBilled` limit, and are preceded by a dry run.
