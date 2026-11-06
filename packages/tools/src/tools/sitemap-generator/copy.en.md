---
summary: Write a sitemap.xml from a list of addresses, with their last-changed dates.
---

# Sitemap generator

Paste a list of addresses, one to a line and each with its last-changed date if you like, and get a `sitemap.xml` in the sitemaps protocol: the right namespace, entities escaped, Arabic addresses percent-encoded, and the lines it left out named with their reason.

## What it checks

- The protocol’s namespace, `http://www.sitemaps.org/schemas/sitemap/0.9` (http, as the protocol writes it).
- Addresses that are full http or https links, all on one site, with no repeats.
- Dates in the form `2026-03-05` (or with a time and a zone), checked against the calendar: 2026-02-30 is refused.
- The limit of 50,000 addresses to a file.
- Characters that need escaping (`&`) and Arabic letters in an address (percent-encoded).

## Example

### Wrong

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/</loc>
  </url>
</urlset>
```

### Right

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/</loc>
  </url>
</urlset>
```

## How to fix

Save the file as `sitemap.xml` at the root of your site, name it in your robots.txt, and give it to Search Console:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/products/oud</loc>
    <lastmod>2026-03-05</lastmod>
  </url>
</urlset>
```

- List only addresses you want in search: pages that answer 200, are not `noindex` and are the canonical.
- Give a date only when it is true: the day the page’s content last changed, not the day you made the file. Google uses it when it proves reliable.
- Over 50,000 addresses, split the list into several files and list them in a sitemap index.
- Most platforms make a sitemap by themselves: use this for a site with no sitemap, or to write one by hand for a part of the site.

## FAQ

### Do I need a sitemap?

A small site that is linked well is found without one. A sitemap helps Google find pages on a large site, a new one, or one with few links to its pages. It does not make Google index them.

### Should I list every page?

Only those that should be in search. A sitemap that lists redirects, errors or `noindex` pages teaches Google to trust it less.

### Does what I type reach Arablyzer?

No. The generator runs in your browser, and nothing you type leaves it.

## Methodology

The generator runs in your browser and writes the sitemaps protocol (sitemaps.org). Addresses are normalised by the browser’s URL parser, which percent-encodes non-ASCII; a date must be a W3C datetime and a real calendar day. The sitemap check Arablyzer runs on sites (`sitemap-invalid`) judges the file it writes.
