---
summary: Does your business's structured data give Google a name, an address, a phone and opening hours it can read, not Arabic days and digits?
---

# Local business structured data checker

Reads the LocalBusiness markup on a store, restaurant or clinic page and checks what Google needs for its name, address, phone and hours to show in search and on the map, and the Arabic forms that look right on the page and are wrong in the data: days written «السبت», times «9:00 ص», phones and coordinates in Eastern Arabic digits.

## What it checks

- That the business has a `name` and an `address` with a street, a locality, a region or a postal code.
- That the `telephone` is in digits 0–9 and starts with the country code (`+968`, `+966`, `+971`).
- That opening hours use Schema.org's English day names and 24-hour times, not Arabic day names or «ص» and «م».
- That `geo` coordinates are numbers with a full stop, not «٢٣٫٥٨٨».

## Example

### Wrong

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Store",
    "name": "متجر الواحة للعطور",
    "address": { "@type": "PostalAddress", "addressLocality": "مسقط" },
    "telephone": "٩٦٨٩١٢٣٤٥٦٧+",
    "openingHoursSpecification": {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["السبت", "الأحد"],
      "opens": "9:00 ص",
      "closes": "21:00"
    }
  }
</script>
```

### Right

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Store",
    "name": "متجر الواحة للعطور",
    "address": { "@type": "PostalAddress", "addressLocality": "مسقط" },
    "telephone": "+96891234567",
    "openingHoursSpecification": {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Saturday", "Sunday"],
      "opens": "09:00",
      "closes": "21:00"
    }
  }
</script>
```

## How to fix

1. Keep what the page shows to people in Arabic, and write the data for machines in Schema.org's forms: English day names, 24-hour times, digits 0–9.
2. Write the phone as `+`, the country code, the number: `+968 9123 4567`.
3. Give the address as a `PostalAddress` with `streetAddress`, `addressLocality`, `addressRegion` and `addressCountry` (`OM`, `SA`, `AE`).
4. If you list the business in both languages, give `name` in both with `@language`.
5. Check the result in Google's Rich Results Test and, in Google Business Profile, keep the same hours: Google compares them.

## FAQ

### Does Google read Arabic days like «السبت» in the markup?

No. Schema.org's `dayOfWeek` is an enumeration of English names. Write `Saturday` in the markup and «السبت» on the page.

### Which businesses does this apply to?

LocalBusiness and its types: stores, restaurants, cafés, pharmacies, clinics, hotels and similar. A business with no physical place, such as an online-only store, is an Organization and is not checked here.

### Why is the telephone with a leading 0 reported?

Because `0501234567` can only be dialled from inside Saudi Arabia. With `+966 50 123 4567` it can be dialled from anywhere, including from the map on a phone abroad.

### Does the tool check my Google Business Profile?

No. It reads your page's markup. Keep the profile and the page in agreement: Google compares the two.

## Methodology

We read the JSON-LD blocks in the page's HTML and the business objects at the top of a block or in its `@graph`. The forms are Google's local business structured data documentation and Schema.org's definitions of `OpeningHoursSpecification`, `DayOfWeek` and `GeoCoordinates`. See the rule's page for the details.
