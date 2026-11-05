---
summary: Is your Shopify store properly in Arabic? Check the language, the direction and the basics.
---

# Shopify Arabic store checker

Give the address of a page of your Shopify store and this tool checks that its Arabic setup is complete: that the page is declared Arabic and right-to-left, that its text is translated, and then the description and sharing tags, the product markup, the links to your policies and the page’s address.

## What it checks

- That a page shown in Arabic (Shopify’s own script says `Shopify.locale = "ar"`) declares `lang="ar"` and `dir="rtl"`, and that its text is mostly Arabic.
- The page’s description and its sharing tags (`og:title`, `og:description`, `og:image`).
- The product’s structured data: a name, an image, an offer with a price written as `120.00`, a currency code such as `SAR` and an availability address.
- Links to the privacy policy, the terms, the returns policy and the shipping policy.
- The page’s address (its handle): no marks, no Eastern digits, no underscores or capitals, and a canonical that matches.

## Example

### Wrong

```html
<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8">
    <title>عطر العود الملكي | متجر الواحة</title>
    <link rel="canonical" href="https://shop.example/products/Royal_Oud">
    <script src="https://cdn.shopify.com/s/files/1/0001/theme.js"></script>
    <script>
      var Shopify = Shopify || {};
      Shopify.locale = "ar";
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "عطر العود الملكي",
      "image": "https://shop.example/img/royal-oud.jpg",
      "offers": {
        "@type": "Offer",
        "price": "١٢٠",
        "priceCurrency": "SAR",
        "availability": "https://schema.org/InStock"
      }
    }
    </script>
  </head>
  <body>
    <main>
      <h1>عطر العود الملكي</h1>
      <p>عطر عود ملكي بتركيز عالٍ في زجاجة من 50 مل.</p>
      <a href="/cart">السلة</a>
    </main>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <title>عطر العود الملكي | متجر الواحة</title>
    <meta name="description" content="عطر عود ملكي بتركيز عالٍ في زجاجة 50 مل، يُشحن خلال يومين.">
    <meta property="og:title" content="عطر العود الملكي | متجر الواحة">
    <meta property="og:description" content="عطر عود ملكي بتركيز عالٍ في زجاجة 50 مل.">
    <meta property="og:image" content="https://shop.example/img/royal-oud.jpg">
    <link rel="canonical" href="https://shop.example/products/royal-oud">
    <script src="https://cdn.shopify.com/s/files/1/0001/theme.js"></script>
    <script>
      var Shopify = Shopify || {};
      Shopify.locale = "ar";
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "عطر العود الملكي",
      "image": "https://shop.example/img/royal-oud.jpg",
      "offers": {
        "@type": "Offer",
        "price": "120.00",
        "priceCurrency": "SAR",
        "availability": "https://schema.org/InStock"
      }
    }
    </script>
  </head>
  <body>
    <main>
      <h1>عطر العود الملكي</h1>
      <p>عطر عود ملكي بتركيز عالٍ في زجاجة من 50 مل.</p>
      <a href="/cart">السلة</a>
    </main>
  <footer>
    <a href="/privacy">سياسة الخصوصية</a>
    <a href="/terms">الشروط والأحكام</a>
    <a href="/returns">سياسة الاسترجاع</a>
    <a href="/shipping">الشحن والتوصيل</a>
  </footer>
  </body>
</html>
```

## How to fix

Fix each item in your Shopify admin, then scan the page again.

```html
<meta name="description" content="عطر عود ملكي بتركيز عالٍ في زجاجة 50 مل، يُشحن خلال يومين.">
<link rel="canonical" href="https://shop.example/products/royal-oud">
```

- Language: add Arabic in the store’s language settings, translate the content in Translate & Adapt, and do not publish the language to shoppers before the translation is done.
- Direction: use a theme that supports right-to-left text (the Theme Store can be filtered by this feature), or ask your theme’s developer to set `lang` and `dir` from the page’s language.
- A product’s title, description and handle: open the product, and under its search engine listing edit the page title, the meta description and the URL handle.
- Policies: write them in the store’s policy settings, and add links to them in the footer menu of the theme (the menu section is called Navigation or Menus, by version).

## FAQ

### Why does my Shopify store show English text when Arabic is on?

Shopify publishes a language as soon as you switch it on, but the content stays in the store’s first language until you translate it. Translate the products, collections, pages, menus and theme text, or hide the language until you have.

### Does Shopify handle right-to-left by itself?

Not by itself: the theme must support it. Themes that do are marked in the Theme Store, and an app or a developer can add it to one that does not.

### Does this tool only work for Shopify stores?

No. It runs the store checks on any page, and the first check is Shopify’s alone: it applies only to a page that Shopify’s own script says is shown in Arabic.

## Methodology

The first check is Shopify’s alone: it applies only when the platform check recognises Shopify and an inline script on the page sets `Shopify.locale` to Arabic. The rest are the store checks Arablyzer runs on any page. The steps come from Shopify’s changelog and help center; we cannot see inside your admin, so a menu can have another name in your account.
