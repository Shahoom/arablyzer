---
summary: Can Google read your page's trail (الرئيسية › العطور › the product): positions in digits 0–9, names, and full addresses?
---

# Breadcrumb structured data checker

Reads the BreadcrumbList markup on a page and checks that Google can use it to show the page's trail in its result: the items numbered 1, 2, 3 in digits 0–9, each with a name and a full address, the last item excepted.

## What it checks

- That the breadcrumb has items.
- That each item's `position` is a whole number from 1, written in digits 0–9, not `١`.
- That the positions run 1, 2, 3 in order.
- That each item has a `name` and, except the last, an `item` address, and that the address is a full one.

## Example

### Wrong

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": "١", "name": "الرئيسية", "item": "/" },
      { "@type": "ListItem", "position": 2, "item": "https://www.example.com/perfumes" },
      { "@type": "ListItem", "position": 3, "name": "عطر العود الملكي" }
    ]
  }
</script>
```

### Right

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": "https://www.example.com/" },
      { "@type": "ListItem", "position": 2, "name": "العطور", "item": "https://www.example.com/perfumes" },
      { "@type": "ListItem", "position": 3, "name": "عطر العود الملكي" }
    ]
  }
</script>
```

## How to fix

1. Number the items from the home page: 1, 2, 3, as numbers.
2. Give every item a `name` and a full `item` address with `https://`; only the last (the page itself) may leave the address out.
3. Print the position from a counter in the template, not from formatted text.
4. Keep the trail in the markup the same as the one the page shows.
5. Check the result in Google's Rich Results Test; on Salla, Zid and Shopify the theme writes the markup, so update it first.

For example:

```json
{ "@type": "ListItem", "position": 2, "name": "العطور", "item": "https://www.example.com/perfumes" }
```

## FAQ

### Does Google still show breadcrumbs in results?

Yes, in many results, as a path beside the address, on mobile and on desktop. It is a display choice of Google's, which valid markup makes possible and does not guarantee.

### Is `item` required in the last element?

No. The last item is the page itself, and Google accepts it without an `item`.

### Can I use `position` as text, such as "1"?

The check accepts a text of digits 0–9 and a number, and rejects `١` and the like, which Google does not read as a number.

### Does it check the trail the page shows?

No, only the markup. Make sure the two say the same.

## Methodology

We read the JSON-LD blocks in the page's HTML and every BreadcrumbList in them. For each item we read `position`, `name` and `item` (the item's own `name` and `@id` count). See the rule's page for the details.
