---
summary: Does your link show a title, a description and an image when it is shared?
---

# Open Graph checker

Checks that your page has the Open Graph tags og:title, og:description and og:image, from which apps build a link's preview when it is shared on WhatsApp and elsewhere.

## What it checks

- An `og:title` tag with text: the preview's title.
- An `og:description` tag with text: the description under the title.
- An `og:image` tag with an image URL: what catches the eye in a preview.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <title>عسل السدر العماني | متجر الواحة</title>
    <meta name="description" content="عسل سدر عماني طبيعي، في عبوات من نصف كيلو." />
  </head>
  <body>
    <h1>عسل السدر العماني</h1>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <title>عسل السدر العماني | متجر الواحة</title>
    <meta name="description" content="عسل سدر عماني طبيعي، في عبوات من نصف كيلو." />
    <meta property="og:title" content="عسل السدر العماني" />
    <meta property="og:description" content="عسل سدر عماني طبيعي، في عبوات من نصف كيلو." />
    <meta property="og:image" content="https://example.com/sidr-honey.jpg" />
  </head>
  <body>
    <h1>عسل السدر العماني</h1>
  </body>
</html>
```

## How to fix

Add the three tags inside `<head>`, with what suits each page:

```html
<meta property="og:title" content="Dhofar incense" />
<meta property="og:description" content="Incense and oud oil from Dhofar's farms, shipped across the Sultanate." />
<meta property="og:image" content="https://example.com/dhofar-incense.jpg" />
```

- Write the image's full URL, starting with `https://`, and use an image that stands for the page, such as the product's photo.
- Most SEO plugins in WordPress, and platforms such as Salla, Zid and Shopify, add these tags from the page's title, description and featured image, so check that those fields are filled in.

## FAQ

### Are the page's title and description enough without Open Graph tags?

Not always. Without Open Graph tags, the app picks what it finds on the page, or shows the bare link, so the preview may show a title or text the app chose, or no description. Without `og:image`, the preview shows no image, or an image the app picks from the page.

### Why does the tool accept `name` instead of `property`?

The Open Graph protocol defines these tags in the `property` attribute, but some sites write them in the `name` attribute, which apps read as well, so we accept both. It is safer to write them in `property`, as the protocol defines them.

### Does the tool draw the preview or check the image itself?

No. We check that the three tags are there and have a value; we do not draw the preview, and we do not fetch the image to check that it opens.

## Methodology

We fetch the page as `ArablyzerBot`, follow its redirects, and read the HTML as the server sends it, before any JavaScript runs. We look for the `<meta>` tags of `og:title`, `og:description` and `og:image` in the `property` attribute, or in the `name` attribute, in any letter case, then apply one rule, which reports each tag that is missing or empty, each in a finding of its own. The same page gives the same result on every check.
