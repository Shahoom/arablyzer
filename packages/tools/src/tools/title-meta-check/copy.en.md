---
summary: Does your page give search engines a title and a description?
---

# Title and meta description checker

Checks that your page has a title tag and a meta description with text; without them, search engines write the result's title and snippet from other text on the page.

## What it checks

- The page has a `<title>` element with text, not an empty one or one with only spaces.
- The page has a `<meta name="description">` tag with text, whatever the letter case of its name.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <title></title>
  </head>
  <body>
    <h1>قهوة عمانية بالهيل</h1>
    <p>قهوة عمانية مطحونة مع الهيل، في علب من نصف كيلو.</p>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <title>قهوة عمانية بالهيل | متجر الواحة</title>
    <meta name="description" content="قهوة عمانية مطحونة مع الهيل، في علب من نصف كيلو، تُشحن خلال يومين." />
  </head>
  <body>
    <h1>قهوة عمانية بالهيل</h1>
    <p>قهوة عمانية مطحونة مع الهيل، في علب من نصف كيلو.</p>
  </body>
</html>
```

## How to fix

Add both tags inside `<head>`, with text that describes this page in particular:

```html
<head>
  <title>Dhofar incense | Al Waha store</title>
  <meta name="description" content="Incense and oud oil from Dhofar's farms, shipped across the Sultanate." />
</head>
```

- Give every page its own title, starting with what sets it apart: the product, the service or the article's subject, then the site's name.
- Write a description for each page in a sentence or two, saying what visitors find there: the product, its price and what sets it apart, or the article's subject.
- In WordPress, the title comes from the theme, and both the title and the description from the SEO plugin, if there is one; in Salla, Zid and Shopify, from the SEO settings of each page or product.

## FAQ

### Does the description raise the page's ranking?

Not directly. But it may show under the page's title in results, so it shapes what people read before they decide to open the page.

### Why does Google show a different title or description from the one I wrote?

Google takes a result's title from the `<title>` element first, but it may write one from other text on the page, such as its `<h1>` main heading. The snippet under the title it picks from the page's text, and it may take it from the description when that describes the page better.

### How long should the title and the description be?

Google sets no length for either, but it truncates them in results as needed, typically to fit the device's screen width. So put what sets the page apart at the start of the title, and write the description in a sentence or two. This tool does not check length.

## Methodology

We fetch the page as `ArablyzerBot`, follow its redirects, and read the HTML as the server sends it, before any JavaScript runs, so a title or description a script adds after loading is not seen. We take the first `<title>` element among the HTML elements, not the title of an SVG image in the page, and look for `<meta>` tags named `description`, in any letter case. Then we apply two rules: the first fails when the title is missing or its text is empty or only spaces, the second when the description is missing or all its tags are empty. The same page gives the same result on every check.
