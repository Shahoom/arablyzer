---
summary: Compare two sitemaps: which addresses were added, removed or given a new date.
---

# Sitemap comparer

Paste a sitemap from before and a sitemap from after (a redesign, a migration, a platform change) and see which addresses were added, which were removed, and which have a new last-changed date. It reads the XML you paste and requests nothing.

## What it checks

- Addresses in the new sitemap that the old one did not have, and the other way round.
- Addresses in both whose last-changed date is not the same.
- How many addresses are the same in both.
- That each paste is a sitemap (a `urlset` or a `sitemapindex`), and, in the page’s example, that it carries the protocol’s namespace.

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

Compare after every migration, and look at what vanished: every address removed should redirect to its new home or be gone for a reason you can state.

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/new-page</loc>
  </url>
</urlset>
```

- Take each removed address and give it a 301 redirect to the page that replaces it (the redirect planner flattens a list of them).
- Check each added address is a page you want indexed and that it is not a duplicate of an old one.
- A date that changed on pages you did not touch means the platform writes the date of the build, not of the content.
- Compare sitemap indexes the same way, then compare the sitemaps they list.

## FAQ

### Does it fetch the sitemaps for me?

No. You paste their XML, so nothing is requested from your site or from anyone’s, and nothing leaves your browser.

### It says my paste is not a sitemap.

It looks for a `urlset` or a `sitemapindex` element. A page of HTML, a compressed file (`sitemap.xml.gz`) or a text sitemap is not read: decompress the file and paste its XML.

### Are the addresses compared as written?

They are compared after the browser’s URL parser normalises them, so a capital in the host or an encoded letter does not count as a change.

## Methodology

The comparer runs in your browser. It reads the `url` or `sitemap` blocks of each file with a pattern (the protocol’s files are flat, and nothing in them is run), decodes the XML entities, and compares addresses and their `lastmod` text. The sitemap check `sitemap-invalid` is the one Arablyzer runs on sites.
