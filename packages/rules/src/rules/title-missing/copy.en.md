# The page has no title

## Messages

### missing

The page has no `<title>` element. Browser tabs show the page's address instead, and search engines write a title from other text on the page.

### empty

The page's `<title>` element is empty. Browser tabs show the page's address instead, and search engines write a title from other text on the page.

## Why it matters

- **In search results**, Google takes a result's title from the `<title>` element first. Without one, it writes a title from the page's headings or other text, which may not describe the page as you would.
- **In the browser**, the title shows in the tab, in bookmarks and in history, and in the link preview many apps show when the page is shared.
- **Screen readers** read the page title first when a page opens, so users know where they are. WCAG 2.2 success criterion 2.4.2 (level A) asks every page for a title that describes its topic.

## How to fix

Add a `<title>` element inside `<head>`, with text that describes this page in particular:

```html
<head>
  <title>Dhofar incense | Al Waha store</title>
</head>
```

- Give every page its own title, starting with what sets it apart: the product, the service or the article's subject, then the site's name.
- In WordPress, the title comes from the theme and from the SEO plugin, if there is one; in Salla, Zid and Shopify, from the SEO settings of each page or product.

## How we detect

1. We read the page's HTML as the server sends it, without running JavaScript.
2. We take the first `<title>` element among the HTML elements, not the title of an SVG image in the page.
3. The rule fails when there is no such element, or when its text is empty or only spaces.

## References

- [Google Search Central: Influencing your title links in search results](https://developers.google.com/search/docs/appearance/title-link)
- [WCAG 2.2: Understanding success criterion 2.4.2, Page Titled](https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html)
- [HTML Standard: the title element](https://html.spec.whatwg.org/multipage/semantics.html#the-title-element)
