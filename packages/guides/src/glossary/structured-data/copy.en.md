# Structured data

Structured data describes a page’s content in a standard format search engines read, such as a product’s price and currency, so the page can qualify for rich results.

## Definition

- Google defines structured data as a standardized format for providing information about a page and classifying its content, such as a recipe’s ingredients and cooking time.
- It mostly uses the Schema.org vocabulary of types and properties, such as `Product`, `Offer` and `price`. For Google Search, Google’s documentation is the reference rather than Schema.org’s.
- Google reads three formats: JSON-LD, Microdata and RDFa. It recommends JSON-LD as the easiest to implement and maintain.

## Why it matters

- It can make a page eligible for rich results: a product result, for example, can show its price, availability and rating.
- Each kind of rich result has required properties, and an item missing one is not eligible. Even correct markup does not guarantee a rich result.
- The data must describe what visitors see on that page. Marking up hidden or misleading content can bring a manual action, which removes the page’s rich results but does not change its ranking.
- For Gulf stores, Schema.org asks for prices in the digits 0 to 9 with a full stop for decimals, and for the currency in `priceCurrency` as an ISO 4217 code, such as `OMR`, `SAR`, `AED`, `KWD`, `BHD` or `QAR`. A price formatted for readers, such as `١٢٫٥٠٠ ر.ع.`, belongs on the page only.

## Example

A product on an Omani store, in JSON-LD, with its price and currency as Schema.org asks:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "عسل السدر العماني",
  "image": "https://example.com/images/sidr-honey.jpg",
  "offers": {
    "@type": "Offer",
    "price": "12.500",
    "priceCurrency": "OMR",
    "availability": "https://schema.org/InStock"
  }
}
</script>
```

## Common mistakes

- Marking up what the page does not show, such as a hidden rating, or a price other than the visible one.
- Leaving out a required property, such as the `price` of an `Offer`.
- Blocking the page to Googlebot with robots.txt or `noindex`, which Google’s guidelines rule out.
- Skipping the tests: Google suggests its Rich Results Test before release, and Search Console’s rich result reports after, since templates can break the data.

## References

- [Google Search Central: Introduction to structured data markup in Google Search](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [Google Search Central: General structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google Search Central: Product snippet structured data](https://developers.google.com/search/docs/appearance/structured-data/product-snippet)
- [Schema.org: price](https://schema.org/price)
