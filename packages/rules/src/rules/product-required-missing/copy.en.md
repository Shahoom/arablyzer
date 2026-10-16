# Product markup lacks a name, an image or an offer

## Messages

### no-name

The product in JSON-LD block {block} (line {line}) has no `name`.

### no-image

The product in JSON-LD block {block} (line {line}) has no `image`; Google asks for one to show a product in Shopping results.

### no-offer

The product in JSON-LD block {block} (line {line}) has no `offers`, `review` or `aggregateRating`; Google needs one of them to show the product as a rich result.

## Why it matters

- Product structured data is how Google reads a product page's name, image, price and rating without guessing. Without a name, an image, or anything to show beside them, the page cannot get a product rich result.
- Google's documentation lists `name` as required for product snippets, an offer, a review or an aggregate rating as the second required part, and an image as required for merchant listings in Shopping results.
- Store themes often print the markup only for some fields, so the page looks right and the markup is half empty.

## How to fix

Give the product's own block its name, its image address, and its offer:

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "عطر العود الملكي",
    "image": "https://www.example.com/royal-oud.jpg",
    "offers": {
      "@type": "Offer",
      "price": "120.00",
      "priceCurrency": "SAR",
      "availability": "https://schema.org/InStock"
    }
  }
</script>
```

- On Salla, Zid and Shopify, the theme or an SEO app writes this block: check that the product has a main image and a price, and that the theme version is current.
- On WordPress with WooCommerce, an SEO plugin (Yoast SEO, Rank Math) writes it from the product's fields.

## How we detect

1. We read the JSON-LD blocks that parse and find Product objects (and the more specific types Schema.org lists) at the top of a block or in its `@graph`. Products named inside lists and offers are other pages' products and are not judged.
2. A product is flagged for each of: no `name`; no `image`; and none of `offers`, `review` and `aggregateRating`. Empty values do not count.

A product whose markup is a bare `@id` reference to a definition elsewhere on the page is read where it is defined.

## References

- [Google Search Central: Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)
- [Google Search Central: Merchant listing structured data](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing)
- [Schema.org: Product](https://schema.org/Product)
