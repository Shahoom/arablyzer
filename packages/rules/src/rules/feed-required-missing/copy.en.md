# Product feed lacks required attributes

## Messages

### missing

{count} of {total} products have no `{attribute}`, which Merchant Center requires; the first is {id}.

### duplicate-id

The id “{id}” is used by {count} products; each product needs an id of its own.

## Why it matters

- Merchant Center disapproves a product that lacks a required attribute: it does not appear in Shopping results or free listings until the attribute is added.
- The required attributes for every product are `id`, `title`, `description`, `link`, `image_link`, `price` and `availability`. Some countries and categories ask for more (such as `brand`, `gtin` or `shipping`); this check reports the ones that are required everywhere.
- Two products with the same `id` overwrite each other: one disappears, and its price and stock follow the other's.

## How to fix

- Fill the attribute for every product, in the store's product fields or in the feed plugin's mapping. A product description is the most often missing; copy the store's description, not its short title.
- Give each product, and each variant, an `id` that never changes and is not reused. The SKU or the internal product id is the usual choice.
- Check that a variant with its own price or stock has its own `id` and shares the product's `item_group_id`.

```xml
<item>
  <g:id>OUD-1</g:id>
  <title>عطر العود الملكي 50 مل</title>
  <description>عطر من خشب العود الطبيعي بتركيز عالٍ.</description>
  <link>https://shop.example/p/oud-1</link>
  <g:image_link>https://shop.example/img/oud-1.jpg</g:image_link>
  <g:price>120.00 SAR</g:price>
  <g:availability>in_stock</g:availability>
</item>
```

## How we detect

1. We read the feed's products (the first 5,000) as RSS 2.0, Atom 1.0 or tab-separated text, with attribute names folded: `g:image_link`, `image link` and `image_link` are one.
2. For each of the seven required attributes, we count the products where it is absent or empty. One finding for each attribute that some product lacks, with the count and the first product.
3. We group the products by `id` and report each id used more than once.

We do not check optional attributes, per-country requirements or whether a link works: nothing but the feed file is requested.

## References

- [Google Merchant Center Help: Product data specification](https://support.google.com/merchants/answer/7052112)
- [Google Merchant Center Help: Product data specification (earlier edition)](https://support.google.com/merchants/answer/188494)
