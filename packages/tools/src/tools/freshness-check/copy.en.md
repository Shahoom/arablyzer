---
summary: Can Google read the publication and update dates of your page, or are they Arabic digits and month names?
---

# Page freshness dates checker

Reads the dates a page states about itself, in its meta tags, its JSON-LD and its Last-Modified header, and checks that a machine can read them: ISO 8601 with digits 0–9, a modification that is not before the publication, and an HTTP date in the header.

## What it checks

- That the publication and modification dates in the meta tags (`article:published_time`, `article:modified_time`, `date`) are ISO 8601, such as `2026-10-11`, not «١١‏/١٠‏/٢٠٢٦» or «11 أكتوبر 2026».
- The same for `datePublished`, `dateModified`, `priceValidUntil` and `validThrough` in the JSON-LD.
- That the last modification is not earlier than the first publication.
- That the `Last-Modified` header is an HTTP date.

## Example

### Wrong

```html
<meta name="date" content="٢٠٢٦/٠٣/٠٥" />
```

### Right

```html
<meta name="date" content="2026-03-05" />
```

## How to fix

1. Print the date from the stored value in ISO form (`2026-03-05`, or `2026-03-05T08:00:00+03:00` with a time), in the meta tag and the JSON-LD. Keep the Arabic formatted date for the page.
2. Make the modification date the date of the last real change.
3. Let the server send `Last-Modified` as `Thu, 05 Mar 2026 08:00:00 GMT`, or not at all.
4. Show the dates on the page in text as well; Google compares the markup with what visitors see.
5. In WordPress, an SEO plugin writes them; check it is not set to print the localised date.

## FAQ

### Does Google use these dates?

It uses dates it finds in markup and on the page to show a date beside a result. It says it does not rely on one signal, and ignores dates that look wrong. Dates it can read give it the choice.

### Should I update the date to look fresh?

Only when the page really changed. Google asks sites not to change dates to look fresh, and compares the date with the content.

### Why is an old date not reported?

Because nothing says how old a page may be. The checker looks at whether the dates can be read and agree, not at their age.

### Does it read dates in the page text?

No, only the meta tags, the JSON-LD and the header. A `<time>` element or a date in a sentence is for visitors.

## Methodology

We read the meta tags and JSON-LD properties that give a date, and the Last-Modified header, in the page as the server sends it. A date is valid when it is a calendar day that exists in ISO 8601, with an optional time and offset. See the rule's page for the details.
