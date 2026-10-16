# Product feed file cannot be read

## Messages

### html

The address gives a web page, not a product feed. Give the address of the feed file itself, an .xml or .txt file.

### empty

The file is empty.

### not-utf8

The file is not valid UTF-8. Arabic saved in another encoding, such as Windows-1256 or Latin-1, reaches Merchant Center as broken letters.

### not-xml

The file starts like XML but breaks at line {line}, column {column}.

### not-a-feed

The file is XML, but its root element is “{root}”, not the `rss` or `feed` of a product feed.

### no-items

The feed has no products: no `item` in an RSS file, no `entry` in an Atom file, and no rows under the columns of a text file.

### no-columns

The file is text, but its first row is not a list of product attributes: Merchant Center expects tab-separated columns such as `id`, `title` and `price`.

## Why it matters

- Google Merchant Center cannot show products it cannot read: a feed it rejects as a whole means no product in Shopping results and free listings, and no price in the ads of a merchant who uses them.
- The usual causes are a wrong address (the store's page instead of the feed's), a plugin that wrote the feed in the wrong encoding, and a file broken by a character the exporter did not escape.
- Arabic product names make the encoding error likely: a file saved in Windows-1256 or Latin-1 looks fine in a spreadsheet and arrives as question marks.

## How to fix

1. Open the address in a browser. A feed shows XML or tab-separated text, not a page with a menu.
2. In the platform's export or in the feed plugin, choose the Google Shopping (Merchant Center) format, and copy the file's address from there.
3. Save or serve the file as UTF-8, and declare it in XML: `<?xml version="1.0" encoding="UTF-8"?>`.
4. Escape `&`, `<` and `>` in product names and descriptions (`&amp;`, `&lt;`, `&gt;`), or wrap the text in `<![CDATA[ … ]]>`.
5. Make sure the file has at least one product.

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
    </item>
  </channel>
</rss>
```

## How we detect

1. We fetch the address given, as for any page, and read the response body: nothing else is requested, and no product or image link in the feed is opened.
2. A body that starts with `<!doctype html` or `<html` is a web page. Empty bodies are empty. Bytes that are not valid UTF-8 are reported as such.
3. XML is read with a strict parser. An RSS 2.0 file must have `rss` as its root with `item` elements under `channel`; an Atom file must have `feed` with `entry` elements. Any other root is not a feed.
4. Anything that is not XML and not JSON is read as tab-separated text: the first row must name at least two columns and one of `id`, `title`, `link`, `price` or `description`.
5. A gzip file served as it is (a `.gz` feed) is not read: Merchant Center reads it, this check does not, so the rule reports that it could not check rather than a fault.

## References

- [Google Merchant Center Help: Product data specification](https://support.google.com/merchants/answer/7052112)
- [Google Merchant Center Help](https://support.google.com/merchants/)
- [W3C: Extensible Markup Language (XML) 1.0](https://www.w3.org/TR/xml/)
