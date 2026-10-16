# A date the page states cannot be read as a date

## Messages

### not-iso

The date in {source} (“{value}”) is not in ISO 8601, such as 2026-10-11 or 2026-10-11T08:00:00+03:00.

### modified-before-published

The page says it was modified ({modified}) before it was published ({published}).

### header-invalid

The Last-Modified header (“{value}”) is not an HTTP date such as Sun, 11 Oct 2026 08:00:00 GMT.

## Why it matters

- Google reads a page's publication and modification dates from its markup, its meta tags and its headers, and shows them in results. A date it cannot parse is dropped, and the page looks undated or stale.
- Arabic pages write dates for people: `١١‏/١٠‏/٢٠٢٦`، «11 أكتوبر 2026». That is right on the page and unreadable in a meta tag or in JSON-LD, which want ISO 8601 with digits 0–9.
- A modification earlier than the publication is a mistake in the data, usually a template that prints the wrong field.
- A wrong `Last-Modified` header makes conditional requests useless or confuses caches.

## How to fix

Print the date from the stored value in ISO form, and the formatted date only on the page:

```html
<meta property="article:published_time" content="2026-03-05T08:00:00+03:00" />
<meta property="article:modified_time" content="2026-04-02" />
```

```json
"datePublished": "2026-03-05T08:00:00+03:00",
"dateModified": "2026-04-02"
```

- Use digits 0–9 and hyphens: `YYYY-MM-DD`, with a time and an offset if you have them.
- Make the modification date the date of the last change to the content, and never earlier than the publication date.
- Let the server send `Last-Modified` as an HTTP date, or not at all.
- Do not change the modification date without changing the page: Google ignores dates it cannot trust.

## How we detect

1. We read the meta tags that give a date (`article:published_time`, `article:modified_time`, `og:updated_time`, `date`, `dcterms.date`, `dcterms.modified`, `last-modified`) and the JSON-LD properties `datePublished`, `dateCreated`, `dateModified`, `priceValidUntil`, `validFrom` and `validThrough`.
2. A date must be ISO 8601: a calendar day that exists, optionally with a time and an offset. Eastern Arabic digits, slashes, month names and the wrong calendar day are all rejected.
3. The latest modification is compared with the earliest publication.
4. A `Last-Modified` header must be an HTTP date (RFC 9110).

We do not judge how old a date is: nothing here says how fresh a page should be. Dates in the visible text and in `<time>` elements are not read.

## References

- [Google Search Central: Influencing your byline date in Google Search](https://developers.google.com/search/docs/appearance/publication-dates)
- [ISO 8601 (W3C note on date and time formats)](https://www.w3.org/TR/NOTE-datetime)
- [RFC 9110: Date/Time formats](https://www.rfc-editor.org/rfc/rfc9110#name-date-time-formats)
