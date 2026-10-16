# Link text says nothing about where it goes

## Messages

### generic

{count} links on the page are called “{text}”, a text that says nothing about the page behind it; the first goes to {href}.

## Why it matters

- Search engines read a link's text to learn what the page it points to is about. "Read more" and «اضغط هنا» teach them nothing, and Google's guidance asks for text that is descriptive and short.
- A screen reader user often moves through a list of the page's links alone. Fifteen links called "More" are fifteen links that cannot be told apart.
- In Arabic stores, product cards ending in «المزيد» or «اضغط هنا» repeat on every list page.

## How to fix

Make the link's own text say what it is, and put the action in the words:

```html
<a href="/p/oud">عطر العود الملكي</a>
```

- On a card, link the product's name, or the whole card with the name as its text.
- Keep a "More" button if the design needs it, but give it an `aria-label` that says more: `aria-label="المزيد عن دهن العود"`.
- Avoid "here" in a sentence: write «حمّل كتالوج 2026» and not «اضغط هنا لتحميل الكتالوج».

## How we detect

1. We read the text of each link (with the `alt` of the images in it) and fold it: harakat and tatweel gone, case and punctuation folded.
2. A link is flagged when its whole text is one of a short list: «اضغط هنا»، «انقر هنا»، «هنا»، «المزيد»، «اقرأ المزيد»، «التفاصيل»، «رابط»، "click here", "here", "read more", "more", "learn more", "details", "link" and a few more.
3. A link with an `aria-label` that is not itself generic is not flagged: its accessible name says more.
4. One finding for each text, with how many links and the first.

The list is ours and short. A link text that is longer than a phrase of it, such as «اقرأ المزيد عن العود», is not flagged.

## References

- [Google Search Central: SEO Starter Guide, link text](https://developers.google.com/search/docs/fundamentals/seo-starter-guide#use-links-wisely)
- [W3C: Understanding Success Criterion 2.4.4 Link Purpose (In Context)](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html)
