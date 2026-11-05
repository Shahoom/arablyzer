---
summary: Do the language versions in your sitemap list each other, and use codes Google accepts?
---

# Sitemap hreflang checker

Give the address of a page of your site and this tool reads the sitemaps its robots.txt names (or `/sitemap.xml`) and checks the language versions they list with `xhtml:link`: that each page lists itself, that versions list each other back, and that the language codes are ones Google accepts. It reads the sitemap files only.

## What it checks

- That a page that lists its versions lists itself too.
- That when page A lists page B, and B is an entry of the same sitemap, B lists A back.
- That each `hreflang` is a language, with an optional script and region, that Google accepts: `ar`, `ar-SA`, `en-GB`, `x-default`; not `ara`, `en-UK` or `ar_SA`.
- That each version is a full address with `https://`.
- A version that is not an entry of the same file may be in another sitemap, and is not judged.

## Example

### Wrong

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://www.example.com/ar/</loc>
    <xhtml:link rel="alternate" hreflang="ar" href="https://www.example.com/ar/"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/"/>
  </url>
  <url>
    <loc>https://www.example.com/en/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/"/>
  </url>
</urlset>
```

### Right

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://www.example.com/ar/</loc>
    <xhtml:link rel="alternate" hreflang="ar" href="https://www.example.com/ar/"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/"/>
  </url>
  <url>
    <loc>https://www.example.com/en/</loc>
    <xhtml:link rel="alternate" hreflang="ar" href="https://www.example.com/ar/"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/"/>
  </url>
</urlset>
```

## How to fix

Give every page of a group the same list of versions, each with its own address in it:

```xml
<url>
  <loc>https://www.example.com/ar/</loc>
  <xhtml:link rel="alternate" hreflang="ar" href="https://www.example.com/ar/"/>
  <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/"/>
</url>
```

- Declare the `xhtml` namespace on the `urlset`.
- Use the codes the hreflang generator writes.
- Use full addresses that match the pages’ `loc`.
- Give hreflang in the sitemap or in the pages’ `<head>`, not both with different answers.

## FAQ

### Sitemap or page tags for hreflang?

Either works. Page tags need no extra file but add to each page's size; a sitemap keeps the pages light and is easier to generate for many versions. Choose one and keep it complete.

### Do I need x-default?

It is not required. Google recommends it for people whose language matches no version.

### Why is a page I listed not checked?

A version that is not an entry of this sitemap may be in another sitemap file, and a single file cannot show whether it lists the page back.

## Methodology

The check reads the `xhtml:link` elements with `rel="alternate"` and an `hreflang` in each entry of each sitemap (`urlset`) the scan fetched, the first 5,000 entries of each, and compares addresses after normalising them. Codes are judged by the check the hreflang page tools use. The scan fetches only the sitemaps the site's robots.txt names first (or `/sitemap.xml`), through the egress proxy, and honours the site's robots.txt.
