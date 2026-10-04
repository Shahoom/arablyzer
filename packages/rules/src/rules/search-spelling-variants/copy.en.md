# Site search loses Arabic spelling variants

## Messages

### loses

Your search loses {lost} of {total} spelling variants we tried: for each, it found none, or less than half, of what the word's own spelling found.

### lost-ta-marbuta

Searching «{query}» (ة and ه swapped from «{word}») found {found} results, against {wanted} for «{word}».

### lost-alef

Searching «{query}» (alef with and without hamza, changed from «{word}») found {found} results, against {wanted} for «{word}».

### lost-ya

Searching «{query}» (ى and ي swapped from «{word}») found {found} results, against {wanted} for «{word}».

### lost-tatweel

Searching «{query}» («{word}» with a tatweel inside) found {found} results, against {wanted} for «{word}».

### lost-diacritics

Searching «{query}» («{word}» with a diacritic added) found {found} results, against {wanted} for «{word}».

### lost-digits

Searching «{query}» (the digits of «{word}» in the other script) found {found} results, against {wanted} for «{word}».

## Why it matters

- Arabic has several correct ways to write one word, and people type each of them: ة or ه at the end of a word, أ إ آ or a plain ا, ى or ي, with or without diacritics, and with Arabic-Indic or Latin digits. A phone keyboard makes some of these a daily accident.
- A search that treats each spelling as a different word shows «no results» to a visitor who typed the word correctly, and many leave: no global SEO tool measures this.
- The content is there. Only the search does not find it.

## How to fix

Normalize the text before it is stored in the search index and the query before it is matched, with the same function. Letters to fold:

- أ إ آ ٱ → ا
- ى → ي
- ة → ه (or the reverse: choose one, for both the text and the query)
- Remove tatweel (ـ) and the diacritics (U+064B to U+065F, and U+0670)
- Arabic-Indic digits (٠ to ٩) and Persian ones (۰ to ۹) → 0 to 9

```js
const normalize = (text) =>
  text
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
```

- Elasticsearch and OpenSearch: the `arabic_normalization` and `arabic` analyzers; Meilisearch and Typesense fold most of these by default; with MySQL or PostgreSQL, store a normalized column and search it.
- On WordPress, search plugins with Arabic normalization (such as SearchWP, or a hosted search with an Arabic analyzer) replace the default title-and-content `LIKE` search.

## How we detect

1. We find the site's search: a `GET` form marked as a search (or with an `input[type=search]`) on the page's own site, else the platform's own search address, when the page runs on one we know (WordPress, Shopify, Salla, Zid).
2. We read the site's robots.txt: if it keeps `ArablyzerBot` from the search's pages, we ask nothing and say so.
3. We ask a query that means nothing, to learn the links every answer has (menu, footer, sidebar), then up to 4 real words from the page, and for each its variants: ة and ه, the alef's hamza, ى and ي, a tatweel, a diacritic, the other script's digits, and one Arabizi spelling, which is shown and never counted. No more than 12 requests in all, one at a time with a pause, as ArablyzerBot.
4. For each query we count the links the answer has beyond that menu and footer, and its first. A variant is lost when it finds none, or fewer than half of what the word's own spelling found. We judge only words whose own spelling found something.
5. The count is what the first page of the answer shows, so it is a floor, not the number of results.

## References

- [Unicode: the Arabic block](https://www.unicode.org/charts/PDF/U0600.pdf)
- [Elasticsearch: arabic_normalization token filter](https://www.elastic.co/guide/en/elasticsearch/reference/current/analysis-arabic-normalization-tokenfilter.html)
- [Meilisearch: Language, Arabic](https://www.meilisearch.com/docs/learn/resources/language)
