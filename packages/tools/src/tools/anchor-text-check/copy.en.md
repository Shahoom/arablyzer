---
summary: Do your links say where they go, or are they «اضغط هنا», «المزيد» and "read more"?
---

# Link text checker

Reads the links on a page and finds those whose whole text says nothing about where they go: «اضغط هنا», «المزيد», «اقرأ المزيد», "click here", "read more". Search engines learn what a page is about from the text of the links to it, and screen reader users move through the page's links one by one.

## What it checks

- Links whose whole text is one of a short list of generic phrases in Arabic and English: «اضغط هنا», «انقر هنا», «هنا», «المزيد», «اقرأ المزيد», «التفاصيل», "click here", "here", "read more", "more", "details".
- The text includes the `alt` of images inside the link, as a screen reader reads it.
- A link with an `aria-label` that says more is not flagged.

## Example

### Wrong

```html
<li>عطر العود الملكي - <a href="/p/oud">اضغط هنا</a></li>
<li>بخور مروكي - <a href="/p/bakhoor">اضغط هنا</a></li>
```

### Right

```html
<li><a href="/p/oud">عطر العود الملكي</a></li>
<li><a href="/p/bakhoor">بخور مروكي</a></li>
```

## How to fix

1. Make the link's text name its target: the product's name, the page's title, what the visitor gets.
2. In cards and lists, link the product name; if the design wants a "More" button, give it an `aria-label`: `aria-label="المزيد عن دهن العود"`.
3. Avoid "here" inside a sentence: write «حمّل كتالوج 2026» instead of «اضغط هنا لتحميل الكتالوج».
4. Keep the text short: a few words, not a sentence.
5. In a store theme, the "more" text of a card is a translation string; change it to include the product's name where the theme allows.

For example:

```html
<a href="/p/dahn" aria-label="المزيد عن دهن العود">المزيد</a>
```

## FAQ

### Is «المزيد» always wrong?

On its own it says nothing, which is why it is flagged. «المزيد من العطور» or «المزيد عن العود» is fine: it says what more. A "More" button with a descriptive `aria-label` is also accepted.

### Does this affect ranking?

Link text is one of the signals Google uses to understand the page a link points to. A generic text gives it less to work with; descriptive text helps, and helps screen reader users too.

### Do internal and external links count alike?

Yes. The check does not follow the links; it reads their text on the page you give.

### Does a button count?

Only links (`<a href>`). A `<button>` is not a link and is not judged here.

## Methodology

We read the text of each link in the page's HTML as the server sends it (with the `alt` of images in it), fold it (harakat and tatweel gone, case and punctuation folded) and compare its whole with a short list of generic phrases in Arabic and English. The list is ours and short. See the rule's page for the details.
