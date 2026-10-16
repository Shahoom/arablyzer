# Product availability in markup is not a Schema.org value

## Messages

### text

The offer in JSON-LD block {block} (line {line}) gives the availability “{availability}”, which is a word and not a Schema.org value; write the address of one, such as `https://schema.org/InStock`.

### unknown

The offer in JSON-LD block {block} (line {line}) gives the availability “{availability}”, which is not one of Schema.org's availability values; check its spelling.

## Why it matters

- Google reads an offer's stock from `availability`. A word in the store's language («متوفر», “in stock”) tells a person and tells Google nothing, so the product shows no stock status, or is left out of listings that need it.
- The value must be one of Schema.org's `ItemAvailability` values, written as its address: `https://schema.org/InStock`, `OutOfStock`, `PreOrder`, `BackOrder`, `SoldOut` and the others. The capital letters matter: `InStock`, not `Instock`.
- Themes that print the store's label into the markup do it silently, so the page looks right.

## How to fix

Map the store's statuses to the Schema.org values, and write each as its address:

```json
"availability": "https://schema.org/InStock"
```

- In stock: `https://schema.org/InStock`; out of stock: `https://schema.org/OutOfStock`.
- Available to order before it arrives: `https://schema.org/PreOrder`; available after a wait: `https://schema.org/BackOrder`.
- Fix it in the theme's template or the SEO app's product settings, where the markup is made, not in the product's text.

## How we detect

1. We read every offer of a product in the page's JSON-LD (an offer given by its `@id` is read from its definition), and the `availability` it gives.
2. A value is accepted when it is one of Schema.org's ItemAvailability values: with the address `https://schema.org/` or `http://schema.org/`, with `schema:`, or bare.
3. A value that starts with a schema.org address but is not on the list is `unknown`; any other is `text`. Empty values and offers without an availability are not judged.

## References

- [Schema.org: ItemAvailability](https://schema.org/ItemAvailability)
- [Google Search Central: Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)
