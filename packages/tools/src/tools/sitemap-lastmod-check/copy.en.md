---
summary: Does your sitemap give each page a date Google can use?
---

# Sitemap lastmod checker

Give the address of a page of your site and this tool reads the sitemaps the site's robots.txt names (or `/sitemap.xml`) and checks the `lastmod` of their entries: that each is a date in the form Google reads, and that they are not all the same day. It reads the sitemap files only.

## What it checks

- That each `lastmod` is a W3C datetime: `2026-03-05`, or a date with a time and a zone. A date such as `05/03/2026`, one in Arabic digits, or a day the calendar does not have is not read.
- That a sitemap of ten pages or more does not give them all the same date, which is the day the file was built.
- The sitemaps the scan fetches from the site: the first it names in robots.txt, or `/sitemap.xml`; the first 5,000 entries of each.
- Nothing is said of whether a date is true: that needs the page's history.

## Example

### Wrong

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/a</loc>
    <lastmod>05/03/2026</lastmod>
  </url>
</urlset>
```

### Right

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/a</loc>
    <lastmod>2026-03-05</lastmod>
  </url>
</urlset>
```

## How to fix

Give each page the day its content last changed, written `YYYY-MM-DD`:

```xml
<url>
  <loc>https://www.example.com/a</loc>
  <lastmod>2026-03-05</lastmod>
</url>
```

- Write dates with Western digits and hyphens; if you cannot give an honest date, leave `lastmod` out.
- Take the date from the page's record of when its content changed, not from the time the sitemap is built.
- If a platform or a plugin writes the sitemap, look for its setting for the date, and update the plugin.
- Do not touch the date for a change that is not one: a new footer or a counter.

## FAQ

### Does a wrong lastmod hurt my site?

It does not penalise the site. Google uses `lastmod` only if it proves reliable, so false or identical dates just make Google ignore them for your site, and you lose the hint.

### Do I need lastmod?

No. It is optional. Google ignores `priority` and `changefreq` and uses `lastmod` when it is accurate. A sitemap with only addresses is valid.

### Why does it need a page of my site and not the sitemap's address?

The scan finds the sitemaps the way a crawler does, from your robots.txt or `/sitemap.xml`, so it checks the ones Google will read.

## Methodology

The check reads the `lastmod` of the entries of each sitemap (`urlset`) that the scan fetched, in the way the sitemaps protocol asks (W3C datetime), and counts the dates. The ten-page threshold for identical dates is Arablyzer's. The scan fetches at most the sitemaps the site's robots.txt names first, through the egress proxy, and honours the site's robots.txt.
