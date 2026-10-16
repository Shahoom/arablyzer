# Business markup is incomplete or written in Arabic forms Schema.org does not read

## Messages

### no-name

The business in JSON-LD block {block} (line {line}) has no `name`.

### no-address

The business in JSON-LD block {block} (line {line}) has no `address` with a street, a locality, a region or a postal code.

### telephone-arabic-digits

The `telephone` in JSON-LD block {block} (line {line}) is written with Eastern Arabic digits (“{telephone}”); use digits 0–9.

### telephone-no-country

The `telephone` in JSON-LD block {block} (line {line}) has no country code (“{telephone}”); write it as +968 9123 4567.

### hours-invalid

The `{property}` in JSON-LD block {block} (line {line}) is “{value}”, which Schema.org does not read: it wants English day names and 24-hour times in digits 0–9.

### geo-invalid

The `{property}` of the coordinates in JSON-LD block {block} (line {line}) is “{value}”, which is not a number with digits 0–9 and a full stop.

## Why it matters

- Google uses a business's markup to show its name, address, phone and hours in search results and on the map. It requires the name and the address; without them the business gets nothing from the markup.
- Arabic is the usual cause of the rest: the days are written «السبت»، the times «9:00 ص»، the phone and the coordinates in Eastern Arabic digits. They read well on the page and tell Google nothing, so the hours shown in search are wrong or empty.
- A phone without its country code reads as a local number that can only be dialled from inside the country; from a visitor abroad or from the map it fails.

## How to fix

Write the data the way Schema.org does, even if the page shows it in Arabic:

```json
"telephone": "+96891234567",
"openingHoursSpecification": {
  "@type": "OpeningHoursSpecification",
  "dayOfWeek": ["Saturday", "Sunday"],
  "opens": "09:00",
  "closes": "21:00"
}
```

- Days: `Monday` to `Sunday` (or `https://schema.org/Monday`), in English whatever the page language.
- Times: 24 hours, `09:00` and `21:00`.
- Phone: `+` then the country code then the number, digits 0–9: Saudi `+966 50 123 4567`, Omani `+968 9123 4567`.
- Coordinates: numbers such as `23.588`, with a full stop.
- Give the name in both languages with `"name": [{"@language": "ar", "@value": "متجر الواحة"}, {"@language": "en", "@value": "Al Waha Store"}]` if you want the business known by both.

## How we detect

1. We read the JSON-LD blocks that parse and find LocalBusiness and its common types (Store, Restaurant, CafeOrCoffeeShop, Pharmacy, MedicalClinic, Hotel, and the others Schema.org lists) at the top of a block or in its `@graph`.
2. A business needs a `name`, and an `address` that is text or has a street, a locality, a region or a postal code.
3. A `telephone` is flagged for Eastern Arabic digits, or when it does not start with `+` or `00`.
4. In `openingHoursSpecification`, `dayOfWeek` must be one of Schema.org's English day names (or PublicHolidays), and `opens` and `closes` times of 24 hours; in `openingHours`, any Arabic character is flagged.
5. `geo` latitude and longitude must be numbers, or text of digits 0–9 with a full stop.

## References

- [Google Search Central: Local business structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Schema.org: LocalBusiness](https://schema.org/LocalBusiness)
- [Schema.org: OpeningHoursSpecification](https://schema.org/OpeningHoursSpecification)
