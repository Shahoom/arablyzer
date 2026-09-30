---
summary: Can Google read your page's structured data, and the product prices in it?
---

# Structured data checker

Checks that your page's JSON-LD is valid JSON that Google can read, and that each product offer has a price in the digits 0–9 and a currency code such as OMR.

## What it checks

- Every `<script type="application/ld+json">` block is valid JSON; if not, we give the kind of error and where it is: an extra comma, an unescaped quote, or a line break inside a text value.
- Every offer of a product has a price: `price` or `priceSpecification.price` in an `Offer`, and `lowPrice` in an `AggregateOffer`.
- The price is written in the digits 0–9 with a full stop for the decimal point, not in Eastern Arabic digits such as `١٢٫٥٠٠`, and without a currency symbol.
- Every offer has a currency in `priceCurrency`, as a three-letter ISO 4217 code such as `OMR` or `SAR`, not `ر.ع.` or `ر.س`.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <title>عطر العود الملكي | متجر الواحة</title>
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
    <p>السعر: ١٢٫٥٠٠ ر.ع.</p>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <title>عطر العود الملكي | متجر الواحة</title>
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
    <p>السعر: ١٢٫٥٠٠ ر.ع.</p>
  </body>
</html>
```

## How to fix

Write the price in the data with the digits 0–9 and a full stop, put the currency in `priceCurrency` as its code, and write text so that it does not break the JSON:

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "بخور «ظفار» الفاخر",
    "offers": {
      "@type": "Offer",
      "price": "8.500",
      "priceCurrency": "OMR",
      "availability": "https://schema.org/InStock"
    }
  }
</script>
```

- Gulf currency codes: `OMR` for the Omani rial, `SAR` for the Saudi riyal, `AED` for the UAE dirham, `KWD` for the Kuwaiti dinar, `BHD` for the Bahraini dinar, `QAR` for the Qatari riyal.
- For a product with several prices (`AggregateOffer`), give `lowPrice`, `highPrice` if you like, and `priceCurrency`.
- Remove the comma before `}` or `]`, and escape a quote inside text as `\"`, or use the Arabic quotation marks «», which need no escaping.
- Better still, generate the block with a JSON encoder, such as `JSON.stringify` in JavaScript or `json_encode` in PHP, and from the price stored in your database, not from the text formatted for the page.
- After the fix, test the page with Google's Rich Results Test.

## FAQ

### My page shows the price as «`١٢٫٥٠٠ ر.ع.`», so why is it wrong in the data?

Because Schema.org asks for prices in the data in the digits 0–9, with a full stop for the decimal point, and for the currency in `priceCurrency` rather than as a symbol in the price. The Arabic format is right on the page, for readers; the data is read by programs: write `"price": "12.500"` and `"priceCurrency": "OMR"` there, and leave the price on the page as it is.

### What happens when a JSON-LD block has a single error?

Google cannot read anything in it: the whole block is ignored, not just the broken line, and Search Console lists this case in its "Unparsable structured data" report. So we give the first error in each block, with its line and column.

### Does the tool replace Google's Rich Results Test?

No. The tool checks the JSON syntax and a product's price and currency only; whether the other Schema.org types and properties are right, and whether the page is eligible for rich results, is for Google's Rich Results Test or the Schema.org validator.

## Methodology

We fetch the page as `ArablyzerBot`, follow its redirects, and read the HTML as the server sends it, before any JavaScript runs, so data a script adds after loading is not seen. We collect every `<script type="application/ld+json">`, in any letter case, and skip empty blocks, then apply two rules. The first checks each block strictly against the JSON specification (RFC 8259) and gives its first error by line and column. The second reads the blocks that parse, `@graph` included, finds products by type, `Product` and its more specific types in Schema.org, and checks each offer's price and currency, accepting a currency that is a code in the ISO 4217 list. We do not check products without offers, nor data written in Microdata or RDFa. The same page gives the same result on every check.
