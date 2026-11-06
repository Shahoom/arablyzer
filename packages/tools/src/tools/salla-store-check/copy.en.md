---
summary: Is your Salla store set up for search? Check a product page for the basics.
---

# Salla store SEO checker

Give the address of a page of your Salla store (a product is best) and this tool checks what shoppers and Google read first: the title and description, the sharing tags, the product markup, the links to your policies, the address of the page and the Arabic language settings. It tells you what to change and where in the Salla dashboard.

## What it checks

- The page’s description and its sharing tags (`og:title`, `og:description`, `og:image`), which Salla writes from the SEO fields of the product or the store.
- The product’s structured data: a name, an image, an offer with a price written as `120.00`, a currency code such as `SAR` and an availability address.
- Links to the privacy policy, the terms, the returns policy and the shipping policy, which Merchant Center and shoppers look for.
- The page’s address (its slug): no marks, no Eastern digits, no underscores or capitals, and a canonical that matches.
- The page’s language and direction: `lang="ar"` and `dir="rtl"`.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <title>عطر العود الملكي | متجر الواحة</title>
    <link rel="canonical" href="https://shop.example/products/Royal_Oud">
    <link rel="stylesheet" href="https://cdn.salla.network/themes/raed.css">
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
    <link rel="stylesheet" href="https://cdn.salla.network/themes/raed.css">
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

Fix each item in the Salla dashboard, then scan the page again: Salla’s theme writes these tags from the fields you fill.

```html
<meta name="description" content="عطر عود ملكي بتركيز عالٍ في زجاجة 50 مل، يُشحن خلال يومين.">
<link rel="canonical" href="https://shop.example/products/royal-oud">
```

- A product’s title, description and address: open the product, and in its data page find the SEO section. Fill the page title, the description and, if you want, the custom address (slug). Save the product data.
- The home page: in the store’s settings find the SEO page (the home page improvements), and fill the title and description.
- Policies: create the privacy, terms, returns and shipping pages from the store’s pages, and add them to the footer menu.
- Salla’s help center explains each of these in its SEO articles; the names of the menus can change between releases.

## FAQ

### Does this tool only work for Salla stores?

No. It runs the store checks on any page. For a page that is not on Salla, the steps below do not apply, and the platform check tells you what it runs on.

### Why does my product page fail even though I filled the SEO fields?

Salla writes the tags from the fields, but themes can differ, and a field left empty falls back to the store’s default. Scan the product page itself, not the home page, and check the page source for the tag.

### Does a better Salla page rank higher?

It makes the page easier for Google to read and for shoppers to trust. It does not promise a rank: that depends on the whole site and on what others offer.

## Methodology

The checks are the store checks Arablyzer runs on any page; Salla adds nothing to how a page is judged, only to where the fix is made. The steps come from Salla’s help center and developer documentation. We cannot see inside a dashboard, so a menu can have another name in your account: if a step does not match, search the dashboard for “SEO”.
