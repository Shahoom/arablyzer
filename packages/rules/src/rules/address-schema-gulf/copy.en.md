# Postal address in structured data has a country or postal code written wrongly

## Messages

### country-code

The postal address names its country as «{country}», not as a two-letter ISO code.

### postal-digits

The postal code {postalCode} is written in Eastern Arabic digits.

### postal-shape

The postal code {postalCode} is not the shape a code of {country} has ({digits} digits).

## Why it matters

- Google asks for `addressCountry` as the two-letter ISO 3166-1 code (`SA`, `AE`, `OM`). A name in Arabic or English may not be matched to the country, and the address can fail to show with the business.
- A postal code in Eastern Arabic digits is not read as a code by programs, and a post office, a map or a delivery app cannot match it.
- A code of the wrong shape (a four-digit Omani one, a six-digit Saudi one) is usually a slip or a code from another country, and a delivery company or a map may reject it.

## How to fix

Write the country as its ISO code and the postal code in digits 0–9, in the shape of its country:

```html
"postalCode": "12345",
"addressCountry": "SA"
```

- Saudi Arabia and Kuwait: 5 digits. Oman: 3 digits. Bahrain: 3 or 4 digits. The UAE and Qatar have no postal code system: leave `postalCode` out.
- In Saudi Arabia, the National Address adds a 4-digit additional number after the postal code: it is not part of `postalCode` in the markup, except in the form `12345-6789`.
- Keep the street and city in the language the page is in; those are text, not codes.

## How we detect

1. We read every `PostalAddress` in the page's JSON-LD.
2. `addressCountry` that is text and not two capital letters is flagged. A country given as an object (`{"@type": "Country", "name": …}`) is not judged.
3. A postal code with Eastern Arabic or Persian digits is flagged. For a country whose code we know (SA, KW, OM, BH), a code of another shape is flagged. The shapes are those of each country's post.
4. The UAE and Qatar are not judged on postal code.

## References

- [Google Search Central: Local business structured data (address)](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Schema.org: PostalAddress](https://schema.org/PostalAddress)
