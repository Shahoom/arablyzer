---
summary: Does your product page's structured data give Google a name, an image, a price, a currency, stock and a rating it can read?
---

# Product structured data validator

Reads the JSON-LD on a product page and checks what Google needs to show it as a product: the name and image, the offer's price in digits 0–9 with an ISO currency code (SAR, AED, OMR, EGP), the availability as a Schema.org value, and the rating as numbers. It catches the Arabic mistakes that look right on the page and are wrong in the markup.

## What it checks

- That the product has a `name`, an `image`, and an `offers`, `review` or `aggregateRating` to show beside them.
- That each offer has a `price` written with digits 0–9 and a full stop (not `١٢٫٥٠٠`), and a `priceCurrency` that is an ISO 4217 code such as `SAR`, not «ر.س».
- That `availability` is a Schema.org value like `https://schema.org/InStock`, not «متوفر» or “in stock”.
- That an `aggregateRating` has a numeric `ratingValue` inside its scale and a review count of at least one, in digits 0–9.

## Example

### Wrong

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "عطر العود الملكي",
    "offers": {
      "@type": "Offer",
      "price": "١٢٠٫٠٠",
      "priceCurrency": "ر.س",
      "availability": "متوفر"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "٤٫٥"
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
    "name": "عطر العود الملكي",
    "image": "https://www.example.com/royal-oud.jpg",
    "offers": {
      "@type": "Offer",
      "price": "120.00",
      "priceCurrency": "SAR",
      "availability": "https://schema.org/InStock"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.5",
      "reviewCount": "128"
    }
  }
</script>
```

## How to fix

The markup is written by the theme or an SEO app, from the product's stored fields. Fix it where it is made:

1. Price: print the stored number (`120.00`), not the formatted text on the page. Eastern Arabic digits and the riyal sign belong to the page, not to the data.
2. Currency: the three-letter code of the store's currency: `SAR`, `AED`, `OMR`, `KWD`, `BHD`, `QAR`, `EGP`.
3. Availability: map the store's statuses to `https://schema.org/InStock`, `OutOfStock`, `PreOrder` or `BackOrder`.
4. Rating: print `ratingValue` and `reviewCount` from the stored numbers, and remove the block while a product has no reviews.
5. Name and image: make sure the product has a main image; the theme takes the markup's image from it.

On Salla, Zid and Shopify, update the theme to its current version first and check the product's fields; a custom theme's template may need the change by hand. On WordPress, the SEO plugin writes it.

For example:

```json
"price": "120.00",
"priceCurrency": "SAR",
"availability": "https://schema.org/InStock"
```

## FAQ

### Does Google need the price in the markup to show the price on the page?

Google reads the price on the page too, but it checks the markup against the page. A price it cannot read in the markup is not used, and a mismatch between them can make the rich result ineligible. Write both, and keep them the same.

### Why is the riyal sign not allowed in `price`?

`price` is a number for machines; the currency goes in `priceCurrency` as its ISO code. The riyal sign (the Saudi riyal's new symbol) or «ر.س» is how the page shows it to people. Schema.org asks for the number alone, with digits 0–9 and a full stop.

### Does the check run my page's scripts?

No. It reads the markup in the HTML as the server sends it. A theme that adds the markup with JavaScript after the page loads is not seen here; Google may read it, but it is safer in the HTML.

### What about products listed on a category page?

Products named inside a list (a carousel or a category's items) are not judged for a name or an image, because they are the product pages' products. Their offers are still checked for a price and a currency.

## Methodology

We read the JSON-LD blocks in the page's HTML, find the Product objects at the top of a block or in its `@graph`, and read their offers and ratings, following `@id` references. The rules are Google's product structured data documentation and Schema.org's definitions: ISO 4217 for currencies, Schema.org's `ItemAvailability` for availability, digits 0–9 for numbers. See each rule's page for the details.
