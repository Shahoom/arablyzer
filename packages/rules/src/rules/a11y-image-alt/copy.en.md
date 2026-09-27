# Image without a text alternative

## Messages

### missing

This image has no text alternative (`alt`), so a screen reader may skip it or read out its file name.

## Why it matters

- People who cannot see an image hear its text alternative instead. Without one, a screen reader may skip the image, or read its file name, such as «IMG_2034.jpg», which tells them nothing.
- WCAG 2.2 asks for a text alternative for every image that carries information (success criterion 1.1.1, level A).
- Google reads the text alternative to understand what an image shows.

## How to fix

- Add an `alt` that says what the image shows or does, in the page's language: `<img src="oud.jpg" alt="زجاجة عطر العود الملكي، 50 مل">`.
- For an image that only decorates, write an empty `alt=""`, so screen readers pass over it.
- For an image that is a link or a button, say where it leads or what it does: `alt="السلة"`.

## How we detect

1. We render the page and run axe-core 4.13.0, the open-source accessibility engine by Deque, with its `image-alt` rule, in each engine.
2. The rule reports each image without a text alternative: no `alt`, `aria-label` or `aria-labelledby`, and not marked as decorative with `alt=""` or `role="presentation"`.
3. It does not apply to pages without images.

## References

- [W3C: Understanding WCAG 2.2, Non-text Content (1.1.1)](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html)
- [W3C WAI: An alt decision tree](https://www.w3.org/WAI/tutorials/images/decision-tree/)
- [axe-core: image-alt](https://dequeuniversity.com/rules/axe/4.13/image-alt)
- [Google: Image SEO best practices](https://developers.google.com/search/docs/appearance/google-images)
