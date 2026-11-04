# Sharing language does not match the page's language

## Messages

### language

The page is in `{lang}` but its `og:locale` is `{locale}`: a share of it is labelled with another language.

### format

The `og:locale` `{locale}` is written with a hyphen; Open Graph writes it with an underscore (`{suggestion}`).

## Why it matters

- `og:locale` tells Facebook, WhatsApp and other apps what language a shared page is in. Left at a theme's or plugin's default (`en_US`), an Arabic page is labelled English, which can change how an app shows it, translates it or offers it to people.
- It is a different tag from `lang` and from hreflang: nothing fills it from them, so a page can be right in two places and wrong in the third.
- An Open Graph locale is a language and a territory joined by an underscore, as Facebook documents (`ar_AR`, `ar_SA`, `en_US`). A hyphen is not a value the apps expect.

## How to fix

Set `og:locale` to the page's language with an underscore:

```html
<html lang="ar" dir="rtl">
<meta property="og:locale" content="ar_SA" />
```

- Choose the territory your readers are in (`ar_SA`, `ar_AE`, `ar_EG`…) or `ar_AR`, the general Arabic locale.
- In WordPress with an SEO plugin, set the site's language to Arabic: the plugin writes `og:locale` from it. On a platform, set the store's language; the theme writes the tag.
- On a page with a translation, list it with `og:locale:alternate` (`en_US`).

## How we detect

1. The page needs a `lang` on `<html>` and a non-empty `og:locale`.
2. The `language` message: the language part of the two (before the hyphen or underscore, lowercase) is not the same.
3. The `format` message: the locale has a hyphen.

## References

- [Open Graph protocol: locale](https://ogp.me/#optional)
- [Meta for Developers: Open Graph (locales)](https://developers.facebook.com/docs/sharing/webmasters/)
