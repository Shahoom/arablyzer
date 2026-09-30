# Alt text

Alt text is the text alternative of an image, written in its alt attribute: screen readers read it in the image's place, and search engines use it to understand the image.

## Definition

- Alt text stands in for an image, in the `alt` attribute of `<img>`, and serves its purpose: what an informative image shows, or where a linked image leads.
- An image that only decorates takes an empty `alt=""`, so screen readers pass over it. With no `alt` at all, the image is not marked as decorative, and a screen reader may read out its file name.
- On an Arabic page, `alt` is written in Arabic: `lang` covers an element's text attributes as well as its content.

## Why it matters

- WCAG 2.2 asks for a text alternative that serves the equivalent purpose for all non-text content (success criterion 1.1.1, level A), since text can become speech, braille or large print.
- People who cannot see the image hear its alternative instead; a file name such as «IMG_2034.jpg» tells them nothing.
- Google uses alt text, with computer vision and the page's content, to understand what an image shows, and as the anchor text of an image that is a link.

## Example

Three images, three kinds of alternative:

```html
<!-- Informative: what the image shows -->
<img src="oud.jpg" alt="زجاجة عطر العود الملكي، 50 مل">

<!-- A link: where it leads -->
<a href="/cart"><img src="cart.svg" alt="السلة"></a>

<!-- Decorative: an empty alt -->
<img src="divider.svg" alt="">
```

## Common mistakes

- Filling `alt` with keywords: Google warns that it gives a poor experience and may make the site look like spam.
- Leaving `alt` out of decorative images instead of writing `alt=""`.
- Repeating text already beside the image: when an image's text is on the page as real text, the W3C's decision tree gives it an empty `alt`.

## References

- [W3C: Understanding WCAG 2.2, Non-text Content (1.1.1)](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html)
- [W3C WAI: An alt decision tree](https://www.w3.org/WAI/tutorials/images/decision-tree/)
- [HTML Standard: requirements for providing text to act as an alternative for images](https://html.spec.whatwg.org/multipage/images.html#alt)
- [Google Search Central: Image SEO best practices](https://developers.google.com/search/docs/appearance/google-images)
