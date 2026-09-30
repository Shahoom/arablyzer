# H1 heading

The H1 is a page’s top-level heading, usually its main title. It tells readers and screen reader users what the page is about, and Google may use it for the result’s title.

## Definition

- HTML has six heading elements, `<h1>` to `<h6>`, from the most important to the least. A page’s main heading, such as a product’s name or an article’s title, usually goes in an `<h1>`.
- HTML asks that, when a page has headings, at least one be of level 1, and that no heading go more than one level below the one before it.
- The `<h1>` is not the `<title>`: the title names the page in tabs and search results, so it must make sense alone, while the first heading is read on the page itself.

## Why it matters

- Browsers and assistive technologies use headings for navigation within a page, so a screen reader user can go straight to the main heading, then to each section.
- Google lists heading elements such as `<h1>` among the sources of title links, and suggests making the main title stand out, for example as the first visible `<h1>` on the page.
- Google says there is no ideal number of headings, and that their order does not matter to Google Search, though a sound order helps screen reader users.

## Example

A product page whose `<title>` stands alone in results, and whose headings outline the page:

```html
<head>
  <title>Omani halwa with saffron, one-kilo box | Al Waha store</title>
</head>
<body>
  <h1>Omani halwa with saffron</h1>
  <h2>Ingredients</h2>
  <h2>Shipping and delivery</h2>
</body>
```

## Common mistakes

- Choosing a heading level for its size rather than its place in the outline; the size belongs in CSS.
- Skipping levels, such as an `<h2>` followed directly by an `<h4>`.
- A logo image as all of the `<h1>`, with no `alt` text, which leaves the heading with nothing to read.
- An empty `<h1>`, as when a theme outputs one for a page whose title field is empty.

## References

- [Google Search Central: Influencing your title links in search results](https://developers.google.com/search/docs/appearance/title-link)
- [Google Search Central: SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [W3C WAI: Headings](https://www.w3.org/WAI/tutorials/page-structure/headings/)
- [HTML Standard: headings and outlines](https://html.spec.whatwg.org/multipage/sections.html#headings-and-outlines)
