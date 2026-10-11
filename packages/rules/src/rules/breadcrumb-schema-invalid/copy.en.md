# Breadcrumb markup is incomplete or malformed

## Messages

### no-items

The breadcrumb in JSON-LD block {block} (line {line}) has no `itemListElement`.

### bad-position

The `position` “{value}” in JSON-LD block {block} (line {line}) is missing or is not a whole number from 1, written with digits 0–9.

### position-order

The breadcrumb's positions in JSON-LD block {block} (line {line}) are {positions}; they must run 1, 2, 3 in order.

### no-name

A breadcrumb item in JSON-LD block {block} (line {line}) has no `name`.

### no-item

A breadcrumb item in JSON-LD block {block} (line {line}) has no `item` address; only the last one may leave it out.

### item-relative

The `item` “{item}” in JSON-LD block {block} (line {line}) is a relative address; use the full address.

## Why it matters

- Google shows a page's trail (الرئيسية › العطور › عطر العود) in its result in place of the address, when the breadcrumb markup is valid. A breadcrumb with an error is not used.
- Arabic pages write the position in the digits of the text (`١`): JSON-LD wants a number, and a position it cannot read ends the list there.
- Each item needs a name and a full address; only the last, the page itself, may leave the address out.

## How to fix

Number the items 1, 2, 3 in order from the home page, and give each a name and a full address:

```json
{ "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": "https://www.example.com/" },
{ "@type": "ListItem", "position": 2, "name": "العطور", "item": "https://www.example.com/perfumes" },
{ "@type": "ListItem", "position": 3, "name": "عطر العود الملكي" }
```

- Print `position` from a counter, as a number, not from the formatted text.
- Write full addresses, with `https://` and the domain.
- The trail in the markup should match the trail on the page.

## How we detect

1. We read the JSON-LD blocks that parse and find every `BreadcrumbList`, wherever it is (at the top, in `@graph`, or in a page's `breadcrumb`).
2. A list needs at least one item. Each item needs a `position` (a whole number of 1 or more, as a number or a text of digits 0–9), a `name` (its own, or its `item`'s), and an `item` address, except the last.
3. The positions together must run 1, 2, 3.
4. An `item` address must start with a scheme.

## References

- [Google Search Central: Breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Schema.org: BreadcrumbList](https://schema.org/BreadcrumbList)
