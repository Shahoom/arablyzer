# Product feed values Merchant Center rejects

## Messages

### availability

{count} products have the availability “{value}”; Merchant Center accepts `in_stock`, `out_of_stock`, `preorder` and `backorder`. The first is {id}.

### condition

{count} products have the condition “{value}”; Merchant Center accepts `new`, `refurbished` and `used`. The first is {id}.

### price-arabic-digits

{count} products write `{attribute}` with Eastern Arabic digits or separators (“{value}”); Merchant Center reads digits 0–9 and a full stop only. The first is {id}.

### price-separator

{count} products write `{attribute}` with a comma (“{value}”); write the number with a full stop for decimals and no thousands separator. The first is {id}.

### price-currency-missing

{count} products write `{attribute}` without a currency code (“{value}”); write the number, a space and the ISO code, such as `120.00 SAR`. The first is {id}.

### price-currency-unknown

{count} products write `{attribute}` with a currency code that is not in ISO 4217 (“{value}”). The first is {id}.

### price-format

{count} products write `{attribute}` in a form Merchant Center cannot read (“{value}”); write the number, a space and the ISO currency code. The first is {id}.

### sale-price

{count} products have a `sale_price` that is not lower than the `price` (“{value}”). The first is {id}.

### link

{count} products have a `{attribute}` that is not a full http or https address (“{value}”). The first is {id}.

### gtin-arabic-digits

{count} products write the `gtin` in Eastern Arabic digits (“{value}”); a GTIN is digits 0–9. The first is {id}.

### gtin-length

{count} products have a `gtin` of the wrong length or with other characters than digits (“{value}”); a GTIN has 8, 12, 13 or 14 digits. The first is {id}.

### gtin-checksum

{count} products have a `gtin` whose check digit is wrong (“{value}”). The first is {id}.

## Why it matters

- Merchant Center disapproves products whose values it cannot read. A price it cannot parse, an availability it does not know or a wrong GTIN means the product is out of Shopping and free listings until the value is fixed.
- Arabic stores meet the same few errors: an availability written in Arabic («متوفر»), a price with the riyal as text («120 ر.س»), prices in Eastern Arabic digits, and a comma as the decimal separator.
- A GTIN with a wrong check digit is rejected even when it looks right to a person; a wrong one can also attach the product to another product's listing.

## How to fix

Write the values the specification lists, whatever language the store shows:

```xml
<g:availability>in_stock</g:availability>
<g:price>120.00 SAR</g:price>
<g:sale_price>99.00 SAR</g:sale_price>
<g:link>https://shop.example/p/oud-1</g:link>
<g:gtin>4006381333931</g:gtin>
```

- Availability: map the store's statuses to `in_stock`, `out_of_stock`, `preorder` or `backorder` in the feed plugin; do not export the label shown to shoppers.
- Price: the number with a full stop, a space, and the three-letter code: `SAR`, `AED`, `OMR`, `KWD`, `BHD`, `QAR`, `EGP`. Gulf currencies with three decimals (OMR, KWD, BHD) keep them: `12.500 OMR`.
- Sale price: below the price, in the same currency.
- Links: full addresses starting with `https://`.
- GTIN: copy it from the product's packaging or the supplier; if the product has none, leave the attribute out and set `identifier_exists` to `no`.

## How we detect

1. For each product (the first 5,000) we read `availability`, `condition`, `price`, `sale_price`, `link`, `image_link` and `gtin`, with spaces and capitals folded: “In Stock” is `in_stock`.
2. A price is judged as the specification writes it: digits with a full stop, one space, an ISO 4217 code. Eastern Arabic digits, a comma, no code, or a code that is not an ISO currency are each a problem of their own. A sale price is compared with the price when both are in the same currency.
3. A link is a problem when it is not an absolute address with `http` or `https`, or has a space.
4. A GTIN is a problem with Eastern Arabic digits, a length other than 8, 12, 13 or 14, or a check digit that fails GS1's modulo-10 rule.
5. Problems are grouped by kind and value: one finding with how many products have it and the first.

We do not check that a link opens or that an availability matches the store's stock: nothing but the feed file is requested.

## References

- [Google Merchant Center Help: Availability](https://support.google.com/merchants/answer/6324448)
- [Google Merchant Center Help: Price](https://support.google.com/merchants/answer/6324371)
- [Google Merchant Center Help: GTIN](https://support.google.com/merchants/answer/6324461)
- [GS1: How to calculate a check digit](https://www.gs1.org/services/how-calculate-check-digit-manually)
- [ISO 4217 currency codes](https://www.iso.org/iso-4217-currency-codes.html)
