---
summary: Does your structured data match what the page shows: price, rating, breadcrumb, telephone?
---

# Markup and content match checker

Give the address of a page and this tool looks for what its structured data says in the text a visitor reads: the product's price, its rating, the names of the breadcrumb trail and the telephone of the business. Markup that says what the page does not show is against Google's guidelines for structured data. Digits are read in Arabic or Western script, so «١٢٠ ر.س» matches a price of 120.

## What it checks

- That the product's price in its offer (or its lowest price) is a number the page shows.
- That the rating the markup gives, its value or its count, is on the page.
- That the names of the breadcrumb markup are in the page's text.
- That an organisation's or business's telephone in the markup is on the page, by its last eight digits, whatever the script and the spaces.
- Only text a visitor reads counts: a script's or a style's does not.

## Example

### Wrong

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "عطر العود الملكي",
  "image": "https://www.example.com/royal-oud.jpg",
  "offers": { "@type": "Offer", "price": "120.00", "priceCurrency": "SAR" }
}
</script>
<p>السعر: ٩٠ ر.س</p>
```

### Right

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "عطر العود الملكي",
  "image": "https://www.example.com/royal-oud.jpg",
  "offers": { "@type": "Offer", "price": "120.00", "priceCurrency": "SAR" }
}
</script>
<p>السعر: ١٢٠ ر.س</p>
```

## How to fix

Make the page and the markup say the same thing, from one value:

```html
<p>السعر: ١٢٠ ر.س</p>
<p>التقييم: ٤٫٥ من ٥ (١٢٨ تقييماً)</p>
```

- Write the price in the page's HTML, not only in a script, and generate the markup from the same value.
- Show the rating with its count, or take it out of the markup.
- Show the breadcrumb trail with the names the markup gives.
- Show the telephone number as text, or as a `tel:` link whose text is the number.

## FAQ

### My price is drawn by a script after the page loads. Is that a problem?

For a crawler that does not run scripts, yes: the price is not in the HTML it reads, so the markup says something the page does not show. Put the price in the HTML, or render the page on the server.

### The page shows the price with tax and the markup without. Which is right?

They must be the same number. Google's merchant listings ask for the price the shopper will pay.

### Why are Arabic digits not a problem?

The check reads «١٢٠» and 120 as the same number, and the markup must use Western digits as the vocabulary asks.

## Methodology

The check reads the structured data of the page (JSON-LD) and the visible text of its HTML. Every number in the text is read in either script of digits, with its separators dropped and with its last separator as the decimal mark, and a price matches if either reading equals it to the third decimal. Only the product the page describes of itself is judged. A telephone matches by its last eight digits. It does not run the page's scripts.
