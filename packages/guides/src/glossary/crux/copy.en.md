# Chrome UX Report (CrUX)

CrUX is Google’s public dataset of how real Chrome users experience websites. It supplies the Core Web Vitals field data in PageSpeed Insights and Search Console.

## Definition

- The Chrome User Experience Report is the dataset of Google’s Web Vitals program: it reflects how real Chrome users experience popular destinations on the web, with all the Core Web Vitals.
- It counts visits by users who share usage statistics, sync their browsing history and set no sync passphrase, in Chrome on desktop and on Android. Chrome on iOS, Android apps’ WebViews and other Chromium browsers, such as Edge, are not counted.
- Its data is grouped by page and by origin (the whole site), and by device type (phone, desktop, tablet), over the last 28 days. The CrUX API updates daily; the BigQuery dataset, monthly.

## Why it matters

- Google Search uses CrUX data to inform its page experience ranking factor, and the same data fills PageSpeed Insights and Search Console’s Core Web Vitals report.
- Not every site is in it: a page or origin must be publicly discoverable (answering 200, not `noindex`) and popular enough. Google does not disclose the minimum, and sites cannot be submitted by hand, so a small site may have data for its origin only, or none.
- Query strings such as `?utm_medium=email` and fragments such as `#main` are stripped, so all visits to a page count together.

## Example

A query to the CrUX API for one page on phones, with a Google Cloud API key:

```bash
curl -s --request POST 'https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"url": "https://example.com/offers", "formFactor": "PHONE"}'
```

For each metric, the answer gives the share of visits in the good, needs improvement and poor ranges, and the 75th percentile, `p75`. With no data for the page, it answers 404, and you can ask for the `origin` instead.

## Common mistakes

- Asking for the wrong origin: Google’s guide warns against adding or leaving out a subdomain such as `www`, and against the wrong protocol.
- Asking too narrowly: one URL on tablets has fewer visits, so more often no data.
- Pages told apart only by a query string, such as `?productID=101` and `?productID=102`: CrUX strips it, and may count them as one page.

## References

- [Chrome for Developers: CrUX overview](https://developer.chrome.com/docs/crux)
- [Chrome for Developers: CrUX methodology](https://developer.chrome.com/docs/crux/methodology)
- [Chrome for Developers: CrUX API](https://developer.chrome.com/docs/crux/api)
- [Chrome for Developers: Using the CrUX API](https://developer.chrome.com/docs/crux/guides/crux-api)
