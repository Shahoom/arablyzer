---
summary: Type your product's name, price and currency, and get Product code with a price and currency Google accepts.
---

# Product schema generator (JSON-LD)

Writes the structured data for a product page as JSON-LD: the product and its offer, with its price, currency and availability in the digits and codes Google asks for, even if you type the price in Arabic digits.

## What it checks

- The price: one number, in the digits 0 to 9 with a decimal point, even when you type it in Eastern Arabic digits such as `١٢٫٥٠٠`.
- The price's decimals for its currency: three for the Omani rial and the Kuwaiti and Bahraini dinars, two for the Saudi riyal and the UAE dirham.
- The currency: a three-letter ISO 4217 code, such as `OMR` and `SAR`, not `ر.ع.` or "riyal".
- The availability: a schema.org value, such as `https://schema.org/InStock`.
- The code itself: valid JSON, with no stray comma and no missing quote.

## Example

### Wrong

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "بن عربي مختص",
    "offers": {
      "@type": "Offer",
      "price": "4.500",
      "priceCurrency": "KWD",
    }
  }
</script>
```

### Right

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "بن عربي مختص",
  "offers": {
    "@type": "Offer",
    "price": "4.500",
    "priceCurrency": "KWD",
    "availability": "https://schema.org/InStock"
  }
}
</script>
```

## How to fix

Fill in the fields, then copy the code and put it on the product's page, in the `<head>` or the `<body>`, one block for each product:

```html
<head>
  <title>بن عربي مختص | متجر الواحة</title>
  <!-- The code as the generator writes it -->
  <script type="application/ld+json">
    { "@context": "https://schema.org", "@type": "Product", "name": "بن عربي مختص" }
  </script>
</head>
```

- Keep the price and currency in the code the same as what visitors see on the page: Google asks that structured data match the page's content.
- When the price or availability changes, change it in the code too.
- If your store's platform writes this code itself, fix its settings or its theme rather than adding a second block for the same product.

## FAQ

### Does the code guarantee that the price shows in Google's results?

No. The code makes your page eligible for product rich results, but Google does not guarantee they show, and it decides when to show them.

### Why three decimals for the Omani rial?

Because the Omani rial is a thousand baisa, so ISO 4217 gives it three decimals, as it does the Kuwaiti and Bahraini dinars. We write the price with its currency's decimals as your browser's own data gives them.

### Do I write the product's name in Arabic?

Yes, write it as the page shows it: Arabic text is kept in the JSON as it is.

### Does what I type reach Arablyzer?

No. The generator runs in your browser, and nothing you type leaves it.

## Methodology

The generator runs in your browser. We read the price after turning Eastern Arabic and Persian digits and the Arabic decimal separator `٫` into Western ones, refuse anything that is not one number, and write it with its currency's number of decimals, as the browser's CLDR data gives it, taken from ISO 4217. We check the currency against the ISO 4217 list the `product-offer-invalid` rule uses, and write the code with `JSON.stringify`, so only valid JSON comes out, with every `<` in it written as `<` so that the text can never end the `<script>` element.
