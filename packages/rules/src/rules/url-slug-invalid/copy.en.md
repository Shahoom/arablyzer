# Page address has a slug that is written two ways

## Messages

### marks

The address {url} has a slug ({slug}) with Arabic marks (harakat, tatweel) in it.

### digits

The address {url} has a slug ({slug}) with Eastern Arabic digits (٠–٩) in it.

### separators

The address {url} has a slug ({slug}) with an underscore, a space, a plus sign, a capital letter, a double hyphen or punctuation in it.

### long

The address {url} has a slug ({slug}) of more than 100 characters.

## Why it matters

- A crawler reads every difference in an address as another page. `قهوة` and `قَهوة` are two addresses, and so are `/Coffee` and `/coffee`: the same page can end up indexed twice, or the second spelling can answer with a 404.
- People type an address, copy it from a message and share it in chats. A slug with marks, Eastern digits or capital letters is the one they get wrong; an underscore is not read as a word break the way a hyphen is, and Google recommends hyphens.
- A very long slug is encoded for sharing (each Arabic letter becomes six characters), so it grows into a line nobody can read in a message or a result.
- Google reads Arabic in addresses, so a clean Arabic slug is fine. The slug generator writes one that is Arabic, short and stable.

## How to fix

Write the slug from the title with words in one spelling, joined by single hyphens:

```html
<link rel="canonical" href="https://shop.example/products/قهوة-عربية-2026" />
```

- Take the marks and the tatweel out of the slug (`مَرحبا` becomes `مرحبا`) and write digits as `0` to `9`.
- Use a hyphen between words, lowercase Latin letters, and no spaces, underscores or punctuation.
- Keep it to a few words, and let the product's name carry the rest.
- Do not change a slug that is already ranking only to tidy it: set up a 301 redirect from the old address to the new one first.
- Platforms write the slug from the title: on Salla, Zid and Shopify the slug is a field of the product or the page, next to its SEO title.

## How we detect

1. We take the page's address and the canonical it names (the canonical only when its path differs), and read each path segment as people read it, with the percent-encoding undone.
2. A segment is flagged for marks if it has harakat, the superscript alef or tatweel; for digits if it has Arabic-Indic or Persian digits; for separators if it has an underscore, a space, a plus sign, a percent sign left after decoding, a capital Latin letter, a double hyphen or punctuation such as a comma, a quote or a bracket.
3. The last segment is flagged as long past 100 characters, counted as people read it, not as it is encoded. This threshold is Arablyzer's: Google gives no number.
4. The home page, and a page whose address and canonical are both the root, are not judged.

We judge the address, not the title: a title with marks is fine as a title. Query strings are left to the URL-parameters check.

## References

- [Google Search Central: URL structure best practices](https://developers.google.com/search/docs/crawling-indexing/url-structure)
