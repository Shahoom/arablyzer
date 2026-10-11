# Product rating in markup is invalid

## Messages

### no-value

The rating in JSON-LD block {block} (line {line}) has no `ratingValue`.

### no-count

The aggregate rating in JSON-LD block {block} (line {line}) has neither `reviewCount` nor `ratingCount`; Google needs one of them.

### bad-number

The `{property}` in JSON-LD block {block} (line {line}) is “{value}”, which is not a number written with digits 0–9 and a full stop.

### out-of-range

The `ratingValue` {value} in JSON-LD block {block} (line {line}) is outside the scale, {worst} to {best}.

### count-zero

The aggregate rating in JSON-LD block {block} (line {line}) counts {value} reviews; mark up a rating only when there is at least one.

## Why it matters

- Stars beside a product in search results come from its rating markup. Google ignores a rating it cannot read as numbers, and a rating with no review count is not eligible.
- A store with Arabic numerals in its markup (`٤٫٥`) shows the right stars on the page and none in Google, because JSON-LD wants digits 0–9 and a full stop.
- A rating outside its scale, or an aggregate of zero reviews, is wrong data in the markup, which Google's guidelines tell sites not to give.

## How to fix

Write the numbers as the data holds them, not as the page shows them:

```json
"aggregateRating": {
  "@type": "AggregateRating",
  "ratingValue": "4.5",
  "reviewCount": "128"
}
```

- Print `ratingValue`, `bestRating`, `worstRating`, `reviewCount` and `ratingCount` from the stored number, not from the formatted text on the page.
- The scale is 1 to 5 unless you say another with `worstRating` and `bestRating`.
- Remove the `aggregateRating` block while a product has no reviews.

## How we detect

1. On a page that describes a product, we read every `AggregateRating` and `Rating` in its JSON-LD (including a review's `reviewRating`).
2. For each we read `ratingValue`, `bestRating`, `worstRating`, `reviewCount` and `ratingCount`: a value is a number when it is a JSON number or a text of digits 0–9 with an optional full stop. Eastern Arabic digits, a comma, and any other text are not.
3. A `ratingValue` outside `worstRating` to `bestRating` (1 to 5 when not given) is out of range. An aggregate rating needs `reviewCount` or `ratingCount`, which must be at least 1.

## References

- [Google Search Central: Review snippet structured data](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
- [Schema.org: AggregateRating](https://schema.org/AggregateRating)
