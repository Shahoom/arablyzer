# Missing or wrong lang attribute on an Arabic page

## Messages

### missing

Most of the page's text is Arabic, but `<html>` declares no language.

### not-arabic-script

Most of the page's text is Arabic, but the page declares `lang="{declaredLang}"`, which is not the code of a language written in Arabic script.

## Why it matters

- **Screen readers** choose their voice and pronunciation rules from the `lang` attribute. When a page says it is English but its text is Arabic, the screen reader reads it with English pronunciation that nobody can follow, and the site becomes hard to use for blind and low-vision visitors.
- **Browsers** rely on the declared language for things like font choice and word-breaking rules, and may offer to translate a page that is already in the visitor's language.
- **Accessibility standards:** WCAG 2.2 success criterion 3.1.1 (level A) requires the default language of the page to be programmatically determined.

## How to fix

Declare Arabic on the `<html>` element, together with the writing direction:

```html
<html lang="ar" dir="rtl">
```

- Add a country code when the content is meant for one country, such as `ar-SA`, `ar-AE` or `ar-OM`.
- When part of the page is in another language, declare it on that element, such as `<span lang="en">Arablyzer</span>`.
- In WordPress the attribute comes from the site language under "Settings → General"; other systems usually set it from their language settings or the theme template.

## How we detect

1. We read the page's HTML as the server sends it, without running JavaScript, and decode it the way browsers do, including older pages in `windows-1256`.
2. We count the letters of the visible text in `<body>`, leaving out scripts, styles and elements with the `hidden` attribute, and split them into Arabic, Latin and other letters. Digits, punctuation and diacritics are not counted.
3. When more than half of the letters are Arabic, we read the `lang` attribute of `<html>`.
4. The rule passes when the page declares a language written in Arabic script: Arabic and its varieties, Persian, Urdu, Pashto, Kurdish and others, or any tag with `-Arab`. It fails when the attribute is missing or empty, or declares another language.

A `<meta http-equiv="content-language">` tag does not replace the attribute, because screen readers use `lang`; we list it in the evidence when present.

## References

- [WCAG 2.2: Understanding success criterion 3.1.1, Language of Page](https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html)
- [W3C: Declaring language in HTML](https://www.w3.org/International/questions/qa-html-language-declarations)
- [HTML Standard: the lang attribute](https://html.spec.whatwg.org/multipage/dom.html#the-lang-and-xml:lang-attributes)
