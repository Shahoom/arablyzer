# Product offer without a valid price or currency (JSON-LD)

## Messages

### no-price

JSON-LD block {block} has an offer with no price (`{property}`), on line {line}.

### bad-price

In JSON-LD block {block}, `{property}` is written as «{price}» on line {line}; Schema.org asks for the digits 0–9 only, with a full stop for the decimal point.

### no-currency

JSON-LD block {block} has an offer with no currency (`priceCurrency`), on line {line}.

### bad-currency

In JSON-LD block {block}, the currency is written as «{currency}» on line {line}, which is not a three-letter ISO 4217 code such as OMR or SAR.

## Why it matters

- Google reads a product's price from `offers` in its structured data, to show it with the product in search results: in product snippets, and in merchant listings.
- For an `Offer`, Google requires `price` or `priceSpecification.price`; for an `AggregateOffer`, `lowPrice` and `priceCurrency`. Merchant listings require `priceCurrency` in every offer, and Google recommends it for product snippets to determine the currency more accurately. Google says the required properties must be there for a page to be eligible for rich results.
- Schema.org asks for prices in the digits 0–9 rather than characters that look like them, with a full stop rather than a comma for the decimal point, and for the currency in `priceCurrency` rather than as a symbol in the price. A price formatted for Arabic readers, such as «١٢٫٥٠٠ ر.ع.», is right on the page but does not meet this in the data.

## How to fix

- Write the price with the digits 0–9 and a full stop, without thousands separators or a currency symbol: `"price": "12.500"` or `"price": 12.5`.
- Put the currency in `priceCurrency` as its three-letter code: `OMR` for the Omani rial, `SAR` for the Saudi riyal, `AED` for the UAE dirham, `KWD` for the Kuwaiti dinar, `BHD` for the Bahraini dinar, `QAR` for the Qatari riyal.
- For a product with several prices (`AggregateOffer`), give `lowPrice`, `highPrice` if you like, and `priceCurrency`.
- Generate the block from the price stored in your database, not from the text formatted for the page:

```json
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
```

- After the fix, test the page with Google's Rich Results Test.

## How we detect

1. We read every JSON-LD block on the page that parses, `@graph` included, and leave broken blocks to the jsonld-syntax-error rule. We find products by `@type`: `Product` and its more specific types in Schema.org, such as `Car` and `ProductGroup`.
2. For each offer in `offers` (one offer or a list), we look for the price in `price` or `priceSpecification.price`, or in `lowPrice` for an `AggregateOffer`, and for the currency in `priceCurrency`. An offer given only by its `@id` is read from the object with that `@id` on the page.
3. A price passes when it is a number, or text of the digits 0–9 with at most one full stop. A currency passes when it is a code in the ISO 4217 list (as its maintenance agency published it on 2026-09-17), in any letter case.
4. We do not check products without offers, since Google accepts reviews or a rating instead, nor `Demand` offers, nor data written in Microdata or RDFa.

## References

- [Google: Product snippet structured data](https://developers.google.com/search/docs/appearance/structured-data/product-snippet)
- [Google: Merchant listing structured data](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing)
- [Schema.org: price](https://schema.org/price)
- [Schema.org: priceCurrency](https://schema.org/priceCurrency)
- [SIX: ISO 4217 currency code lists, from the maintenance agency](https://www.six-group.com/en/products-services/financial-information/data-standards.html)
