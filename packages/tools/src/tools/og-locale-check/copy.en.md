---
summary: Is your page's sharing language the same as its language: ar_SA, not en_US?
---

# Open Graph locale checker

Give the address of a page and this tool compares its `og:locale` (the language a share of the page is labelled with) with its `lang`, and checks that the locale is written the way Open Graph writes it, with an underscore: `ar_SA`.

## What it checks

- That the language of `og:locale` is the language of `<html lang>`: an Arabic page with `og:locale` `en_US`, the default of many themes and plugins, is flagged.
- That the locale is written with an underscore (`ar_SA`), not a hyphen (`ar-SA`).
- A page without a `lang` or without an `og:locale` has nothing to compare and is not judged: the sharing-tags and language checks cover those.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta property="og:locale" content="en_US">
  </head>
  <body>
    <h1>قهوة عربية بالهيل</h1>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta property="og:locale" content="ar_SA">
  </head>
  <body>
    <h1>قهوة عربية بالهيل</h1>
  </body>
</html>
```

## How to fix

Set the locale to the page's language:

```html
<html lang="ar" dir="rtl">
<meta property="og:locale" content="ar_SA">
```

- Choose the territory your readers are in (`ar_SA`, `ar_AE`, `ar_EG`…) or `ar_AR`, the general Arabic locale.
- In WordPress, set the site's language to Arabic: the SEO plugin writes the tag from it. On a platform, set the store's language.
- List a translation with `og:locale:alternate`.
- Check the sharing preview after the change: apps may keep an older copy.

## FAQ

### Does og:locale affect my search ranking?

No. It is for the apps that show a shared link: Facebook, WhatsApp and others. It affects how they label and offer the page, not how Google ranks it.

### Is ar_AR a real locale?

It is the general Arabic locale that Facebook documents. A territory (`ar_SA`) is also accepted. Choose either and keep it the same across the site.

### Does it check my hreflang?

No: the hreflang checkers do. This one compares only `og:locale` with `lang`.

## Methodology

The check reads `<html lang>` and the page's `og:locale`, takes the language part of each (before a hyphen or an underscore, lower case) and compares them, and looks for a hyphen in the locale. Open Graph's locale format is the one its documentation gives.
