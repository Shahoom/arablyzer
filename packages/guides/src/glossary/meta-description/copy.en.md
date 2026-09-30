# Meta description

The meta description is a short summary of a page in its HTML head. Google may show it as the snippet under the result’s title when it describes the page well.

## Definition

- The `<meta name="description">` tag, in the page’s `<head>`, holds a summary of the page in its `content` attribute. HTML asks for free text that describes the page, fit for a directory such as a search engine, and allows one per page.
- Under each result’s title, Google shows a snippet. It writes snippets mainly from the page’s content, and sometimes uses the meta description when it describes the page more accurately. One page may get different snippets for different searches.

## Why it matters

- It is your sentence or two to tell searchers what the page holds and why to open it; Google likens a good description to a pitch.
- It does not raise the page’s ranking: Google has said it does not use the description in ranking. Its value is in what people read before they click.
- There is no length limit, but Google cuts the snippet to fit the device’s width, so the essentials go first.
- It need not be prose: Google suggests gathering details scattered over the page into it, such as a product’s price and maker.

## Example

A list of keywords says little; a description tells visitors what they will find:

```html
<!-- A list of keywords -->
<meta name="description" content="coffee, Omani coffee, cardamom, Arabic coffee, beans">

<!-- A description of the page -->
<meta name="description" content="Omani coffee ground with cardamom, in half-kilo tins, shipped across Oman within two days.">
```

## Common mistakes

- The same description on every page or product: Google says identical or similar descriptions do not help.
- A long string of keywords, which Google says is less likely to be shown.
- A description too short to say anything, such as the product’s name alone.
- Two description tags, as when the theme adds one and an SEO plugin another.

## References

- [Google Search Central: Control your snippets in search results](https://developers.google.com/search/docs/appearance/snippet)
- [Google Search Central Blog: Google does not use the keywords meta tag in web ranking (2009)](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag)
- [HTML Standard: the description metadata name](https://html.spec.whatwg.org/multipage/semantics.html#meta-description)
