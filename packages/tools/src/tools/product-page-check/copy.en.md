---
summary: Can Google read your product's price and currency from your page's data?
---

# Product page checker

Checks that your product structured data gives a price and currency in the form Google asks for, and that Omani, Kuwaiti and Bahraini prices have three decimals.

## What it checks

- Each product `Offer` in JSON-LD has a price: `price` or `priceSpecification.price`, or `lowPrice` for an `AggregateOffer`.
- The price in the data is in the digits 0–9, with a full stop for the decimal point: not in Eastern Arabic digits, and without a currency symbol.
- Each offer has a currency in `priceCurrency`, as its three-letter ISO 4217 code, such as `OMR` or `SAR`, not «ر.ع.».
- Prices in Omani rials, Kuwaiti dinars and Bahraini dinars in the page's text are written with three decimals, such as «12.500 ر.ع.».

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "عطر العود الملكي",
        "offers": {
          "@type": "Offer",
          "price": "١٢٫٥٠٠",
          "priceCurrency": "ر.ع."
        }
      }
    </script>
  </head>
  <body>
    <h1>عطر العود الملكي</h1>
    <p>السعر: 12.50 ر.ع.</p>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "عطر العود الملكي",
        "offers": {
          "@type": "Offer",
          "price": "12.500",
          "priceCurrency": "OMR"
        }
      }
    </script>
  </head>
  <body>
    <h1>عطر العود الملكي</h1>
    <p>السعر: 12.500 ر.ع.</p>
  </body>
</html>
```

## How to fix

Generate the JSON-LD block from the price stored in your database, not from the text formatted for the page, and write the price on the page with its currency's decimals:

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "عطر العود الملكي",
    "offers": {
      "@type": "Offer",
      "price": "12.500",
      "priceCurrency": "OMR",
      "availability": "https://schema.org/InStock"
    }
  }
</script>
<p>السعر: 12.500 ر.ع.</p>
```

- Write the price in the data with the digits 0–9 and a full stop, without thousands separators or a currency symbol: `"price": "12.500"` or `"price": 12.5`.
- Put the currency in `priceCurrency` as its code: `OMR` for the Omani rial, `SAR` for the Saudi riyal, `AED` for the UAE dirham, `KWD` for the Kuwaiti dinar, `BHD` for the Bahraini dinar, `QAR` for the Qatari riyal.
- For a product with several prices (`AggregateOffer`), give `lowPrice`, `highPrice` if you like, and `priceCurrency`.
- In your shop platform's currency settings, set three decimals for the Omani rial and the Kuwaiti and Bahraini dinars.
- After the fix, test the page with Google's Rich Results Test.

## FAQ

### Why can't I write the price in the data as it shows on the page?

Because Schema.org asks for the price in the digits 0–9 rather than characters that look like them, with a full stop for the decimal point, and for the currency in `priceCurrency` rather than in the price. A price formatted for Arabic readers, in Eastern Arabic digits with «ر.ع.», is right on the page, but in the data it does not meet what Schema.org asks.

### Will my prices show in Google if the page passes?

Not necessarily. Passing means the price and currency are written as Google asks, and Google says the required properties must be there for a page to be eligible for rich results. But the tool checks the price and currency only, not the product's other properties, so test the page with Google's Rich Results Test too.

### My shop's data is in Microdata. Does the tool check it?

No. The tool reads JSON-LD blocks only: not data in Microdata or RDFa, nor blocks that scripts add after the page loads. It does not check products without offers either, since Google accepts reviews or a rating instead.

## Methodology

We fetch the page as `ArablyzerBot`, following its redirects, and read the HTML as the server sends it, before any JavaScript runs. We read every JSON-LD block in it that parses, `@graph` included, and find products by type: `Product` and its more specific types in Schema.org. For each offer we look for the price in `price`, `priceSpecification.price` or `lowPrice`, and for the currency in `priceCurrency`; a price passes as a number, or as text of the digits 0–9 with at most one full stop, and a currency as a code in the ISO 4217 list its maintenance agency publishes. Then we read the visible text for prices in Omani rials and Kuwaiti and Bahraini dinars, numbers with the currency's marker before or after them, and report the first price in each currency with one or two digits after its decimal mark. The same page gives the same result on every check.
