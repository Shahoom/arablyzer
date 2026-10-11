---
summary: Is the file at this address a product feed Google can read, or a web page, empty or broken XML?
---

# Product feed file checker

Give the address of your product feed and this tool tells you whether the file can be read as one: that it is the feed and not a web page, that it is UTF-8, that its XML is well formed, that it is an RSS or Atom feed, and that it holds products. It requests the one file.

## What it checks

- That the address gives a feed file, not a web page: a store's address or a login page is not a feed.
- That the file is not empty and is valid UTF-8, the encoding Arabic needs to survive the trip.
- That an XML file is well formed, and says where it breaks; that its root is `rss` or `feed`, not a sitemap or another document.
- That the feed has products, and that a text file's first row names its columns.

## Example

### Wrong

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://shop.example/p/oud-1</loc></url>
  <url><loc>https://shop.example/p/msk-2</loc></url>
</urlset>
```

### Right

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>متجر الواحة</title>
    <link>https://shop.example/</link>
    <description>منتجات متجر الواحة</description>
    <item>
      <g:id>OUD-1</g:id>
      <title>عطر العود الملكي 50 مل</title>
      <description>عطر من خشب العود الطبيعي بتركيز عالٍ ويدوم طويلاً.</description>
      <link>https://shop.example/p/oud-1</link>
      <g:image_link>https://shop.example/img/oud-1.jpg</g:image_link>
      <g:price>120.00 SAR</g:price>
      <g:availability>in_stock</g:availability>
      <g:condition>new</g:condition>
      <g:gtin>4006381333931</g:gtin>
      <g:brand>الواحة</g:brand>
    </item>
    <item>
      <g:id>MSK-2</g:id>
      <title>مسك أبيض 20 مل</title>
      <description>مسك أبيض ناعم برائحة هادئة يناسب الاستخدام اليومي.</description>
      <link>https://shop.example/p/msk-2</link>
      <g:image_link>https://shop.example/img/msk-2.jpg</g:image_link>
      <g:price>45.500 OMR</g:price>
      <g:sale_price>39.900 OMR</g:sale_price>
      <g:availability>preorder</g:availability>
      <g:gtin>036000291452</g:gtin>
    </item>
  </channel>
</rss>
```

## How to fix

1. Open the address in a browser: a feed shows XML or tab-separated text, not a page with a menu.
2. Copy the feed's address from the platform's Google Shopping or Merchant Center export, or from the feed plugin's settings.
3. Save the file as UTF-8 and declare it in the first line of XML: `<?xml version="1.0" encoding="UTF-8"?>`.
4. Escape `&`, `<` and `>` in names and descriptions, or wrap the text in `<![CDATA[ … ]]>`.
5. When the file reads, check its products with the [Google Merchant feed checker](/en/tools/feed-check).

## FAQ

### My feed is a .gz file. Why was it not checked?

Merchant Center reads compressed feeds, but this check reads XML and text files only, so it says it could not check instead of calling it a fault. Give the address of the uncompressed file if the platform offers one.

### My store gives only a page, with no feed address. What do I do?

Then your platform needs an export or an app that makes a Google Shopping feed. A feed is a file the platform generates; there is nothing to check until it exists.

### Is a sitemap a feed?

No. A sitemap lists your pages for search engines, a product feed lists your products with prices and stock for Merchant Center. The tool tells them apart by the file's root element.

## Methodology

We fetch the address and read the response body: a body that starts like HTML is a web page, an empty one is empty, bytes that are not valid UTF-8 are reported so, XML is read with a strict parser, and anything else is read as tab-separated text. A gzip file served as it is is not read, and the result says it could not check. See the rule's page for the details.
