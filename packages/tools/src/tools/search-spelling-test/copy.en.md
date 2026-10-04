---
summary: Does your site search find a word however it is spelled: ة or ه, أ or ا, ى or ي?
---

# Arabic spelling search test

Finds your site's search, asks it for real words from your page and for each word's other spellings (ة and ه, hamza on or off the alef, ى and ي, a tatweel, diacritics, the other script's digits), and tells you how many of those variants it loses.

## What it checks

- That your search finds a word spelled in the other correct way: ة for ه, أ إ آ for ا, ى for ي, with a tatweel or a diacritic added, with Arabic-Indic digits for Latin ones.
- The result is «your search loses N of M variants», with the words, the variants asked and what each found, against what the word's own spelling found.
- It asks at most 12 requests, one at a time, as ArablyzerBot, after reading robots.txt: if robots.txt keeps the bot from your search pages, it asks nothing and says so.

## Example

### Wrong

```html
<!-- WHERE title LIKE '%word%': the exact letters only -->
```

### Right

```html
<!-- WHERE normalize(title) LIKE normalize('%word%'): one spelling for all -->
```

## How to fix

Normalize the text you index and the query you receive, with the same function, folding أ إ آ to ا, ى to ي, ة to ه, dropping tatweel and diacritics, and writing digits in one script:

```js
const normalize = (text) =>
  text
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
```

- Elasticsearch and OpenSearch: the `arabic_normalization` filter in an `arabic` analyzer. Meilisearch and Typesense fold most of these by default.
- WordPress, Salla, Zid and Shopify: look for a search app or plugin that normalizes Arabic; the stores' default search often matches letters as typed.

## FAQ

### Does the test send many requests to my site?

At most 12, one at a time with a pause, from ArablyzerBot, which says so in its user agent. It reads your robots.txt first, and asks nothing if it keeps the bot from your search pages. It never submits any other form.

### How does it find my search?

From the page: a form with a `GET` method marked as a search (`role="search"`) or with an `input[type=search]`, on your own site. If the page has none, from the platform's own search address, when the platform is one we know (WordPress, Shopify, Salla, Zid). Those patterns are not something your page said, and the result says which way it was found.

### Why is an Arabizi spelling shown but not counted?

Because no search is expected to know how someone spells Arabic in Latin letters («mktba»). It is shown, since many visitors type it, but it is not part of the loss.

### Why does it say nothing when my search finds nothing for a word?

A word whose own spelling finds nothing tells nothing of its variants, so it is left out of the count.

## Methodology

We ask a query that means nothing first, to learn the links every answer holds (menu, footer, sidebar). Then we ask up to four words from your page (headings first) and for each its variants. We count, for each answer, the links it holds beyond those, and the first. A variant is lost when it finds none, or fewer than half of what the word's own spelling found. The count is what the first page of the answer shows, so it is a floor. See the rule's page for the details.
