# Title tag

The title tag names a page in its HTML head. Browsers show it in the tab, and Google uses it, among other sources, to write the result’s title link.

## Definition

- The `<title>` element, in the page’s `<head>`, holds the page’s title; in SEO it is called the title tag. Browsers show it in the tab, in bookmarks and in history.
- HTML allows one `<title>` per page, and asks for a title that identifies the page out of context, as in bookmarks or search results.
- Google calls a result’s clickable headline its title link, and writes it automatically from several sources, among them the `<title>`, the page’s main visible title, headings such as `<h1>`, and `og:title`.

## Why it matters

- Google says the title link is often the main thing people read to decide which result to click.
- WCAG 2.2 success criterion 2.4.2 (level A) asks every page for a title that describes its topic or purpose.
- There is no length limit, but Google cuts the title link to fit the device’s width, so put what sets the page apart first.
- On Arabic pages, Google asks for the title in the language and script of the page’s main content. With an English title, or Arabic in Latin letters, Google may pick other text from the page instead.

## Example

The same product in Arabic and in English, each page titled in its own language, with the store’s name last:

```html
<!-- https://example.com/sidr-honey -->
<title>عسل السدر العماني، عبوة نصف كيلو | متجر الواحة</title>

<!-- https://example.com/en/sidr-honey -->
<title>Omani sidr honey, half-kilo jar | Al Waha store</title>
```

## Common mistakes

- One title for every page, or boilerplate that changes by one word, so pages cannot be told apart in results.
- A half-empty title, such as `| Al Waha store`, when the template leaves out the product’s name.
- Vague titles such as “Home”, or the same keywords repeated to stuff the title.
- Two `<title>` elements, as when the theme adds one and an SEO plugin another.

## References

- [Google Search Central: Influencing your title links in search results](https://developers.google.com/search/docs/appearance/title-link)
- [HTML Standard: the title element](https://html.spec.whatwg.org/multipage/semantics.html#the-title-element)
- [WCAG 2.2: Understanding success criterion 2.4.2, Page Titled](https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html)
