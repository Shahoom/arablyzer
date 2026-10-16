# hreflang and the page's lang disagree

## Messages

### language-differs

The page lists itself as {hreflang} in hreflang, but its `lang` is “{lang}”: the language is not the same.

### region-differs

The page lists itself as {hreflang} in hreflang, but its `lang` is “{lang}”: the language is the same, the country is not.

## Why it matters

- hreflang says what a version is for (here, Saudi Arabia in Arabic); `lang` says what its text is written in. When they disagree, one of them is wrong, and search engines, browsers and screen readers get two answers for one page.
- The common cause in a store is a copied template: the Emirates store was made from the Saudi one, and the head kept `lang="ar-SA"` or the links kept the first country's code.
- `lang` decides how screen readers pronounce the text and which fonts and quotes a browser picks; hreflang decides which version people in each country are shown.

## How to fix

Make the code the page lists itself with and its `<html lang>` agree:

```html
<html lang="ar-SA" dir="rtl">
```

- If the page is for Saudi Arabia, both say `ar-SA` (or `lang="ar"` with `hreflang="ar-SA"`: a `lang` without a region fits any country).
- If the text is in another language than the list says, fix the list: the version for that language is another page.
- In a store builder, set the language and the country of each market, and check the theme prints `lang` from the market's language.

## How we detect

1. We find the page's own entry among its hreflang links, by its canonical address (see the rule about the set of links); when the scan cannot tell which entry the page is, it does not judge.
2. We compare its language subtag with the language subtag of `<html lang>`, and, when both give a region, the regions. A `lang` without a region matches any region.

## References

- [Google Search Central: Localized versions of your pages](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [W3C: Declaring language in HTML](https://www.w3.org/International/questions/qa-html-language-declarations)
