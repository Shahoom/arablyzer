# lang attribute

The HTML lang attribute declares the language of a page or of a part of it, so screen readers, browsers and translation tools treat the text as that language.

## Definition

- `lang` names the language of an element's text and of its text attributes, with a BCP 47 tag: `ar` for Arabic, `en` for English, plus a region when it matters, such as `ar-SA`.
- Elements inherit it, so the page's language goes on the root element, `<html lang="ar">`, and a passage in another language takes its own `lang`. An empty value means the language is unknown.
- `lang` does not set the direction: an Arabic page needs `dir="rtl"` as well.

## Why it matters

- Screen readers choose voice and pronunciation by it: an Arabic page declared English, or with no language, may be read with English pronunciation nobody can follow.
- WCAG 2.2 asks that software can determine the page's default language (success criterion 3.1.1, level A) and the language of each passage (3.1.2, level AA), except proper names, technical terms and words that have become part of the surrounding text.
- Browsers use it for choices such as fonts and word breaking, and CSS can select by it with `:lang(ar)`.
- Google does not use it: it reads a page's language from its visible content, and learns about its other language versions from `hreflang`.

## Example

The page's language on `<html>`, and an English name marked where it appears:

```html
<html lang="ar" dir="rtl">
  <body>
    <p>ادفع عبر <span lang="en">Apple Pay</span> أو بطاقة مدى.</p>
  </body>
</html>
```

## Common mistakes

- Leaving the `lang="en"` of an English template on the Arabic version of the site.
- Writing a language's name instead of its code: `lang="arabic"` or `lang="english"` names no language, so screen readers do not switch.
- Using `<meta http-equiv="content-language">` instead of the attribute: the W3C advises never to use it for that.
- Putting `lang` on `<body>` only: it does not cover `<head>`, where `<title>` is.

## References

- [W3C: Declaring language in HTML](https://www.w3.org/International/questions/qa-html-language-declarations)
- [HTML Standard: the lang attribute](https://html.spec.whatwg.org/multipage/dom.html#the-lang-and-xml:lang-attributes)
- [WCAG 2.2: Understanding success criterion 3.1.1, Language of Page](https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html)
- [Google Search Central: Managing multi-regional and multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
