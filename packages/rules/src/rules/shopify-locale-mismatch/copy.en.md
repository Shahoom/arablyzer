# Shopify store shown in Arabic but its theme or text is not

## Messages

### lang

This Shopify page is shown in Arabic (its own script says `Shopify.locale = "ar"`), but the page declares `lang="{lang}"` instead of Arabic.

### dir

This Shopify page is shown in Arabic, but its text direction is not right-to-left (`dir="{dir}"`).

### untranslated

This Shopify page is shown in Arabic, but only {arabicLetters} of its {totalLetters} letters are Arabic: the content is not translated.

## Why it matters

- `lang` tells browsers, screen readers and search engines the page's language. A page declared English that is read as Arabic gets the wrong voice, hyphenation, spell-check and search language.
- A theme without right-to-left direction draws an Arabic page backwards: the menu on the wrong side, punctuation in the wrong place, and icons that point the wrong way.
- Switching Arabic on in Shopify publishes the language before its content is translated, and shoppers meet a store in English under an Arabic address, which is poor for them and for search.

## How to fix

Make the theme and the translations match the language:

```html
<html lang="ar" dir="rtl">
```

- Use a theme that supports right-to-left text. Shopify's Theme Store can be filtered by this feature (Features, then Right-to-left). If your theme does not support it, change the theme or ask its developer to add it.
- In the theme, set `lang` from the page's language (`{{ request.locale.iso_code }}`) and `dir` from whether it is right-to-left, instead of writing `en` in the layout file.
- Translate the store's content in Translate & Adapt (Shopify's app for it): products, collections, pages, menus, and the theme's own text.
- Until Arabic is translated, do not publish it for shoppers.

## How we detect

1. A page counts as a Shopify page shown in Arabic when Arablyzer’s platform check recognises Shopify with 50 or more confidence out of 100, and an inline script on the page sets `Shopify.locale` to `ar` or an Arabic variant.
2. The `lang` message: `<html lang>` is not Arabic. The `dir` message: neither `<html>` nor `<body>` has `dir="rtl"`.
3. The `untranslated` message: the page has 50 letters or more and fewer than a fifth of them are Arabic. The fifth is Arablyzer’s threshold, chosen so that a page with Arabic text and some product names in English is not flagged.

## References

- [Shopify changelog: auto-translating Arabic and Hebrew in Translate & Adapt](https://changelog.shopify.com/posts/support-for-auto-translating-arabic-and-hebrew-in-translate-adapt)
- [W3C: structural markup and right-to-left text in HTML](https://www.w3.org/International/questions/qa-html-dir)
