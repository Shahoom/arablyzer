# Arabic page without dir="rtl" on the html element

## Messages

### missing

Most of the page's text is Arabic, but `<html>` has no `dir="rtl"` attribute.

### not-rtl

Most of the page's text is Arabic, but `<html>` declares `dir="{declaredDir}"` instead of `dir="rtl"`.

### body-only

`dir="rtl"` is set on `<body>` only, not on `<html>`.

## Why it matters

- **Without a declared direction, the browser lays the page out left to right:** lines start on the left, the punctuation at the end of a sentence moves to its start, and numbers and English words inside Arabic sentences end up in the wrong places.
- **Direction is part of the text's meaning, so it belongs in HTML, not CSS:** this is the recommendation of the W3C and the HTML standard. Styles may fail to load or be ignored, for example in a browser's reader mode or when the content is copied elsewhere, while the attribute stays with the text.
- **Putting it on `<body>` alone is not enough:** elements outside `<body>` do not inherit it, including `<title>`, which appears in the browser tab and in bookmarks.

## How to fix

Put the direction and the language together on `<html>`:

```html
<html lang="ar" dir="rtl">
```

- You can then remove `direction: rtl` from CSS if it is set on `html` or `body`; the attribute replaces it.
- When part of the page needs the other direction, such as a code sample or an English paragraph, put `dir="ltr"` on that element only.
- `dir="auto"` does not suit a whole page: the browser guesses the direction from the first letter of the text, so it may choose left to right when the page starts with a Latin brand name.

## How we detect

1. We count the letters of the visible text in `<body>`, as in the page-language rule; the rule applies when more than half of them are Arabic-script. That includes other languages written in Arabic script, such as Persian and Urdu, which are also written right to left.
2. We read the `dir` attribute of `<html>`. The rule passes when its value is `rtl`, in any letter case.
3. It fails when the attribute is missing or is `ltr`, `auto` or anything else. When `dir="rtl"` is on `<body>` only, the message says so.

This version does not read CSS, and the rule asks for the attribute even when CSS sets the direction.

## References

- [W3C: Structural markup and right-to-left text in HTML](https://www.w3.org/International/questions/qa-html-dir)
- [HTML Standard: the dir attribute](https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute)
- [W3C: Arabic & Persian Layout Requirements](https://www.w3.org/TR/alreq/)
