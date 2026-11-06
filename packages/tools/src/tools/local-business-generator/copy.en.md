---
summary: Write LocalBusiness markup for a Gulf business, with its two names and opening days.
---

# Local business markup generator

Fill in a business's names in Arabic and English, its address, telephone, hours and location, and get the `LocalBusiness` markup for its page: the names as `name` and `alternateName`, the country as an ISO code, the telephone with its country code, the hours in Schema.org's English day names and 24-hour times, and coordinates as numbers. It is the markup Arablyzer's local business checks pass.

## What it checks

- The Arabic name as `name` and the English one as `alternateName` (or the one you give).
- The country as the two-letter ISO code (`SA`, `AE`, `OM`, `KW`, `BH`, `QA`), and the postal code in the shape of the country, in digits 0–9.
- The telephone in international form (`+968…`), whatever digits or spaces you typed it with.
- Hours written in Arabic or English days (`السبت-الخميس 09:00-21:00`) become Schema.org's `dayOfWeek` names and times.
- Coordinates in Arabic or Western digits, with a comma or a point, become numbers.

## Example

### Wrong

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Store",
  "name": "متجر الواحة",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "طريق الملك فهد",
    "addressLocality": "الرياض",
    "addressCountry": "Saudi Arabia"
  },
  "telephone": "٠٥٠١٢٣٤٥٦٧"
}
</script>
```

### Right

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Store",
  "name": "متجر الواحة",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "طريق الملك فهد",
    "addressLocality": "الرياض",
    "addressCountry": "SA"
  },
  "telephone": "+966501234567"
}
</script>
```

## How to fix

Put the block in the page that describes the business, and keep its details the same as the page shows:

```html
"telephone": "+966501234567",
"address": { "@type": "PostalAddress", "addressCountry": "SA" },
"openingHoursSpecification": [{ "@type": "OpeningHoursSpecification", "dayOfWeek": ["Saturday"], "opens": "09:00", "closes": "21:00" }]
```

- Use the type nearest to the business (a café, a pharmacy, a clinic); `LocalBusiness` if none is.
- Keep the name, telephone and address the same everywhere: the page, Google Business Profile, social profiles.
- Update the hours when they change, including at Ramadan and on holidays.
- On a platform, add the block through its code or tag area, or check that the theme does not already write one.

## FAQ

### Do I need this if I have a Google Business Profile?

The profile is what appears in maps. The markup on your own page says the same things to a search engine from the page itself and keeps the two matching. It helps; it does not replace the profile.

### Why the English day names?

Schema.org asks for them: `Saturday`, `Sunday`… A day in Arabic («السبت») is not a value it knows, and Google would not read the hours.

### Does what I type reach Arablyzer?

No. The generator runs in your browser, and nothing you type leaves it.

## Methodology

The generator runs in your browser. Its output is judged in a test by `local-business-invalid` and `address-schema-gulf`, the checks Arablyzer runs on pages. Postal code shapes: five digits for Saudi Arabia and Kuwait, three for Oman, three or four for Bahrain; the UAE and Qatar have none. Days in a range walk forward round the week from the first to the last, Saturday first. A `<` in text is written as an escape so a name cannot end the block.
