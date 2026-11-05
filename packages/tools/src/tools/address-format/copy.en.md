---
summary: Is the postal address in your structured data written as Google and the Gulf post expect?
---

# Gulf address format checker

Give the address of a page and this tool reads the postal addresses in its structured data and checks the country and the postal code: the country as a two-letter ISO code (SA, AE, OM, KW, BH, QA), and a postal code in the shape the country’s post uses, written in digits 0–9.

## What it checks

- `addressCountry` as a two-letter ISO code, not a name such as «السعودية» or “Saudi Arabia”.
- A postal code in Eastern Arabic or Persian digits.
- A postal code of the wrong shape for its country: five digits in Saudi Arabia and Kuwait, three in Oman, three or four in Bahrain.
- The UAE and Qatar have no postal code system and are not judged on it.

## Example

### Wrong

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "متجر الواحة",
  "address": {
    "@type": "PostalAddress",
    "postalCode": "12345",
    "addressCountry": "Saudi Arabia"
  }
}
</script>
```

### Right

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "متجر الواحة",
  "address": {
    "@type": "PostalAddress",
    "postalCode": "12345",
    "addressCountry": "SA"
  }
}
</script>
```

## How to fix

Write the country as its ISO code and the postal code in digits 0–9, in its country’s shape:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "متجر الواحة",
  "address": {
    "@type": "PostalAddress",
    "postalCode": "12345",
    "addressCountry": "SA"
  }
}
</script>
```

- Saudi Arabia and Kuwait: 5 digits. Oman: 3 digits. Bahrain: 3 or 4 digits. The UAE and Qatar: leave `postalCode` out.
- In Saudi Arabia the National Address adds a 4-digit additional number; in the markup it belongs in `postalCode` only in the form `12345-6789`.
- Keep the street and the city in the page’s language.
- The generator for structured data writes these fields for you.

## FAQ

### Why must the country be a code?

Google asks for the two-letter ISO 3166-1 code in `addressCountry`. A name may not be matched to the country.

### My country has no postal code. What do I write?

Leave `postalCode` out. The UAE and Qatar do not have a postal code system, and a made-up code is worse than none.

### Does this check the address is real?

No. It checks how the address is written, not that it exists.

## Methodology

The check reads every `PostalAddress` in the page’s JSON-LD. A country given as an object is not judged. For SA, KW, OM and BH it checks the postal code against the shape each country’s post uses; for other countries it checks only the digits. The shapes are those the posts publish and may change; tell us if one has.
