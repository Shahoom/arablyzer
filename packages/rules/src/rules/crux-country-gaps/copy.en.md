# Visitors' experience in some countries is below the mark

## Messages

### lcp

The Largest Contentful Paint (LCP) is good for under 75% of phone visits in {count} countries ({countries}), by the CrUX tables for {month}.

### inp

The Interaction to Next Paint (INP) is good for under 75% of phone visits in {count} countries ({countries}), by the CrUX tables for {month}.

### cls

The Cumulative Layout Shift (CLS) is good for under 75% of phone visits in {count} countries ({countries}), by the CrUX tables for {month}.

## Why it matters

- **A site's average hides the differences between countries.** One country's network and phones differ from another's, and a site that is fast in Riyadh may be slow in Cairo or Rabat.
- **Google measures the page by its real visitors**, so a site that does not pass at most of its visitors does not pass in the page experience assessment.
- **The usual CrUX API has no country dimension**; the difference shows only in the per-country BigQuery tables.

## How to fix

- Start with the worst country: what are its network and devices? Test the page at a network speed and on a phone like theirs.
- Bring your server closer to your visitors: a CDN with points of presence in the region.
- Cut the size of images, fonts and scripts and defer what is not above the fold (see the page speed and image weight checks).
- Fix the dimensions of images and ads to avoid layout shift (CLS).
- Reduce heavy work on the main thread to improve responsiveness (INP).

## How we detect

1. We query your site's origin (the domain with its protocol) in the Chrome UX Report tables in BigQuery for nine Arab countries: Saudi Arabia, the UAE, Egypt, Kuwait, Qatar, Bahrain, Oman, Jordan and Morocco (`chrome-ux-report.country_<cc>.<yyyymm>`), for the latest month whose tables are published, phones only.
2. For each country we compute the share of good visits: LCP up to 2500 ms, INP up to 200 ms, CLS up to 0.1, from the tables' histograms; and we ask the origin's popularity rank in each country with a second, smaller query.
3. We run the query as a dry run first at no cost, and run it only if it reads less than the cap, and BigQuery refuses to bill more than the cap (`maximumBytesBilled`). We keep the result for a day.
4. The tool runs when the operator has put in a service account and a project to pay for it; without them it stops with a notice and sends nothing.
5. A country shows in the result only if the origin has enough data in it. It is a minor finding.

## References

- [Chrome UX Report on BigQuery](https://developer.chrome.com/docs/crux/guides/bigquery)
- [web.dev: the Core Web Vitals and their thresholds](https://web.dev/articles/vitals)
