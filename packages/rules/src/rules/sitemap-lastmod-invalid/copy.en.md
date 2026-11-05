# Sitemap dates that Google cannot use

## Messages

### invalid

The sitemap {sitemap} has {count} `lastmod` dates that are not W3C datetimes, such as «{value}».

### identical

The sitemap {sitemap} gives all of its {count} pages the same `lastmod` date, «{value}».

## Why it matters

- `lastmod` tells Google when a page last changed, so it can crawl changed pages first and leave the rest. Google uses it only if it is consistently and verifiably accurate.
- A date in another form (`05/03/2026`, Arabic digits, a day the calendar does not have) is not a date to a crawler, which skips it.
- A sitemap where every page has the day the file was built tells Google nothing, and teaches it to ignore the date for the whole site.

## How to fix

Write each date as the day the page's content last changed, in the form `YYYY-MM-DD`, or with a time and a zone:

```html
<url>
  <loc>https://shop.example/a</loc>
  <lastmod>2026-03-05</lastmod>
</url>
```

- Use Western digits and hyphens: `2026-03-05`, or `2026-03-05T08:30:00+03:00`.
- Take the date from the page's own record (when it was edited), not from the time the sitemap is built.
- If you cannot give an honest date, leave `lastmod` out: no date is better than a false one.
- Platforms and plugins that write the sitemap have a setting for this; check that they write the content's date.

## How we detect

1. We read the sitemaps the scan fetched that are a `urlset`, and the first 5,000 of their entries.
2. A `lastmod` is valid when it is a W3C datetime: a date `YYYY-MM-DD`, optionally with a time (`T08:30:00`) and a zone (`Z` or `+03:00`), on a day the calendar has.
3. The `identical` message needs ten dated entries or more, all the same. Ten is our threshold, to leave a small site that changed all its pages at once alone.
4. We do not judge whether a date is true: that needs the page's history.

## References

- [Google Search Central: build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [sitemaps.org: the protocol](https://www.sitemaps.org/protocol.html)
