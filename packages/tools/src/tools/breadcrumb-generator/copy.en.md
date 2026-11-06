---
summary: Write a breadcrumb trail's markup: numbered steps and full addresses, in Arabic.
---

# Breadcrumb markup generator

Type the steps of a page's trail, a name and an address on each line, and get the `BreadcrumbList` markup: positions numbered 1, 2, 3 in Western digits, full addresses for each step, and the last step, the page itself, without an address as Google allows.

## What it checks

- Positions are numbers from 1, in order, written in Western digits (`1`, not `١`).
- Every step has a name; every step but the last has a full `https://` address.
- The last step can stand without an address: it is the page itself.
- A trail needs two steps at least, the home page and the page.
- A step with a missing name or a relative address is left out and named.

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

Put the block in the page, with the same steps as its visible trail:

```html
{ "@type": "ListItem", "position": 2, "name": "العطور", "item": "https://www.example.com/perfumes" }
```

- Write the steps from the home page down to the page, the way a visitor would go.
- Use the same names as the visible trail shows.
- A product in two categories gets one trail: the one the visitor came by, or the main one.
- Platforms often write breadcrumb markup by themselves: check before you add another.

## FAQ

### Does breadcrumb markup show in the result?

Google can show a trail in place of the address under a result when the markup is right. It is a hint: Google decides.

### Why a Western-digit position?

`position` is a number in the vocabulary. An Arabic-Indic digit is a string Google cannot read as one.

### Does what I type reach Arablyzer?

No. The generator runs in your browser, and nothing you type leaves it.

## Methodology

The generator runs in your browser. A test runs the `breadcrumb-schema-invalid` check over what it writes. Addresses are normalised by the browser’s URL parser. A `<` in a name is written as an escape so a name cannot end the block.
