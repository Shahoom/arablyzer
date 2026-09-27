# The page has no main heading (h1)

## Messages

### missing

The page has no `<h1>` main heading, so neither screen readers nor search engines find a heading that names its topic.

### empty

The page has an `<h1>` element, but it is empty, so neither screen readers nor search engines find a heading that names its topic.

## Why it matters

- **Screen readers** let their users move through a page by its headings, and the `<h1>` main heading tells them its topic from the start.
- **Search engines** read headings to understand a page's topic and sections, and Google lists heading elements such as `<h1>` among the sources it may write a page's title in results from.
- More than one `<h1>` on a page is not an error, and this rule does not count it; what matters is a main heading with text.

## How to fix

Put the page's topic in an `<h1>` heading: the product's name, the article's title or the service's name.

```html
<main>
  <h1>Omani halwa with saffron</h1>
  <p>…</p>
</main>
```

- Choose a heading's level by its place in the page's structure, not by its font size; set the size with CSS.
- If the main heading is a logo image, give it alternative text that describes it in its `alt` attribute.
- In ready-made themes, the `<h1>` usually comes from the page's or product's title: check that the field is not empty and that the theme does not turn it into another tag.

## How we detect

1. We read the page's HTML as the server sends it, without running JavaScript.
2. We collect the `<h1>` elements and read each one's text, with the alternative text of the images in it, as a screen reader reads it.
3. The rule passes when any of them has text, and fails when there is none or all are empty.

## References

- [Google Search Central: Influencing your title links in search results](https://developers.google.com/search/docs/appearance/title-link)
- [W3C WAI: Headings in page structure](https://www.w3.org/WAI/tutorials/page-structure/headings/)
- [HTML Standard: the h1 to h6 elements](https://html.spec.whatwg.org/multipage/sections.html#the-h1,-h2,-h3,-h4,-h5,-and-h6-elements)
