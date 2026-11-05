---
summary: Does your Zid store still use Zid’s default title and description? Check a page.
---

# Zid store SEO checker

Give the address of a page of your Zid store (the home page or a product) and this tool checks whether the title and description are the ones Zid writes when you set none, then the sharing tags, the product markup, the links to your policies and the page’s address.

## What it checks

- Zid’s default title («name | متجر إلكتروني») and default description («اكتشف منتجات وتشكيلات وأحدث عروض…»), which say the same on every store.
- The page’s description and its sharing tags (`og:title`, `og:description`, `og:image`).
- The product’s structured data: a name, an image, an offer with a price written as `120.00`, a currency code such as `SAR` and an availability address.
- Links to the privacy policy, the terms, the returns policy and the shipping policy.
- The page’s address (its slug): no marks, no Eastern digits, no underscores or capitals, and a canonical that matches.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="description" content="اكتشف منتجات وتشكيلات وأحدث عروض الواحة.">
    <title>الواحة | متجر إلكتروني</title>
    <link rel="canonical" href="https://shop.example/products/Royal_Oud">
    <link rel="icon" href="https://media.zid.store/icon.png">
    <script src="https://static.zid.store/js/script_loader.js"></script>
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
    <link rel="icon" href="https://media.zid.store/icon.png">
    <script src="https://static.zid.store/js/script_loader.js"></script>
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

Fix each item in the Zid dashboard, then scan the page again: Zid’s theme writes these tags from the fields you fill.

```html
<meta name="description" content="عطر عود ملكي بتركيز عالٍ في زجاجة 50 مل، يُشحن خلال يومين.">
<link rel="canonical" href="https://shop.example/products/royal-oud">
```

- The store’s title and description: open the SEO settings of the store in the Zid dashboard and write them for the home page. Zid’s developer documentation lists the sections that take SEO content: the home page, products, categories and pages.
- A product’s title, description and address: open the product in the dashboard and fill its SEO fields.
- Policies: create the privacy, terms, returns and shipping pages and add them to the footer menu.
- The menus are named differently between releases: search the dashboard for “SEO”, or ask Zid’s support.

## FAQ

### How do I know the title is Zid’s default?

It ends with « | متجر إلكتروني», the form Zid wrote on its demo store when we looked. If Zid changes the wording, the tool will not flag it, but the advice stands: a title with your products’ names is better than any default.

### Does this tool only work for Zid stores?

No. It runs the store checks on any page, and the first check is Zid’s alone: it applies only to a page the platform check recognises as Zid’s.

### Do I need to change the title of every product?

Start with the home page and the products and categories that sell most. A product with its own title and description is read better than one with a default.

## Methodology

The first check is Zid’s alone: it applies only when Arablyzer’s platform check recognises Zid with enough confidence, and flags the title and description wording we saw on Zid’s demo store on 2026-11-04. The rest are the store checks Arablyzer runs on any page. The steps come from Zid’s developer documentation; we cannot see inside a dashboard, so a menu can have another name in your account.
