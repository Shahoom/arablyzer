# Right-to-left (RTL)

Right-to-left (RTL) is the writing direction of Arabic and similar scripts: lines start at the right edge, and a page declares it in HTML with the dir attribute.

## Definition

- Arabic, Persian, Urdu and Hebrew are written from right to left: each line starts at the right edge.
- A page declares it in HTML with `dir="rtl"` on `<html>`. CSS has a `direction` property, but the W3C and the HTML and CSS standards ask for the attribute: direction is part of the text's meaning, and must hold where styles do not apply.
- The base direction also sets the default text alignment, the order of table columns, the direction of horizontal overflow, and the order of Arabic and Latin runs in a paragraph.

## Why it matters

- Without a declared direction, an Arabic page is laid out left to right: lines start on the left, a sentence's final punctuation moves to its start, and numbers and English words land in the wrong places.
- `dir="rtl"` on `<body>` alone does not reach the elements outside it, such as `<title>`.
- Left-to-right themes keep their physical sides: a menu hidden past the left edge, the side a right-to-left page scrolls toward, can widen the page on a phone.

## Example

Direction and language on the root, and the other direction only where needed:

```html
<html lang="ar" dir="rtl">
  <body>
    <h1>سياسة الخصوصية</h1>
    <p lang="en" dir="ltr">This policy is also available in English.</p>
  </body>
</html>
```

## Common mistakes

- Setting the direction with CSS `direction: rtl` alone: it is lost where styles do not apply, such as a reader mode.
- `dir="auto"` on the whole page: the browser takes the direction from the first strong letter, so a page starting with a Latin brand name turns left to right.
- Keeping `text-align: left` and `margin-left` from an English theme, instead of `text-align: start` and `margin-inline-start`.
- "Next" arrows pointing right: forward in Arabic is to the left, and browsers do not mirror icons.

## References

- [W3C: Structural markup and right-to-left text in HTML](https://www.w3.org/International/questions/qa-html-dir)
- [HTML Standard: the dir attribute](https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute)
- [W3C: CSS Writing Modes Level 3, the direction property](https://www.w3.org/TR/css-writing-modes-3/#direction)
- [W3C: Arabic & Persian Layout Requirements](https://www.w3.org/TR/alreq/)
