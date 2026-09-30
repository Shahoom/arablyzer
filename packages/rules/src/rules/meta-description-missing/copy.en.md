# The page has no description

## Messages

### missing

The page has no `<meta name="description">` tag, so search engines pick text from the page to show under its title in results.

### empty

The page's `<meta name="description">` tag is empty, so search engines pick text from the page to show under its title in results.

## Why it matters

- **In search results**, Google shows a short snippet under each result's title. It may take it from the page's description when that describes the page better than its text, so a good description is your chance to tell searchers in a sentence or two why to open the page.
- **When the link is shared**, many apps show the description in the link preview when they find no `og:description` tag.
- The description does not raise the page's ranking directly, but it shapes what people read before they decide to open it.

## How to fix

Add the description tag inside `<head>`, with a sentence or two that sum up the page:

```html
<head>
  <meta name="description" content="Omani coffee ground with cardamom, in half-kilo tins, shipped within two days." />
</head>
```

- Write a description for each page, saying what visitors find there: the product, its price and what sets it apart, or the article's subject.
- In WordPress the description usually comes from the SEO plugin; in Salla, Zid and Shopify, from the description field of each page's or product's SEO settings.

## How we detect

1. We read the page's HTML as the server sends it, without running JavaScript.
2. We look for `<meta>` tags named `description`, in any letter case.
3. The rule passes when any of them has text, and fails when there is none or all are empty.

## References

- [Google Search Central: Control your snippets in search results](https://developers.google.com/search/docs/appearance/snippet)
- [HTML Standard: the description metadata name](https://html.spec.whatwg.org/multipage/semantics.html#meta-description)
