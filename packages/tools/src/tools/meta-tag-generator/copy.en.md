---
summary: Write your page's head: title, description, canonical and sharing tags.
---

# Meta tag generator

Type a page's title, description and address and get the tags for its head: the title and description, the canonical link, the tags for sharing on Facebook, WhatsApp and X, the viewport, and the `html` tag with the page's language and direction. The tags are the ones Arablyzer's page checks read.

## What it checks

- The page has a `<title>` with text and a `<meta name="description">` with text.
- The sharing tags `og:title`, `og:description` and `og:image`, which a link shows when it is shared.
- The viewport tag, without which a phone shows the page as a small desktop page.
- The language and direction on the `html` tag (`lang="ar" dir="rtl"`), written for you.
- What you type is escaped, so a title with `<` or `&` does not break the page.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <title></title>
  </head>
  <body>
    <h1>قهوة عربية بالهيل</h1>
    <p>قهوة عربية محمّصة ومطحونة مع الهيل.</p>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>قهوة عربية بالهيل | متجر الواحة</title>
    <meta name="description" content="قهوة عربية محمّصة تحميصاً خفيفاً ومطحونة مع الهيل، تُشحن خلال يومين.">
    <meta property="og:title" content="قهوة عربية بالهيل | متجر الواحة">
    <meta property="og:description" content="قهوة عربية محمّصة تحميصاً خفيفاً ومطحونة مع الهيل.">
    <meta property="og:image" content="https://example.com/og.png">
  </head>
  <body>
    <h1>قهوة عربية بالهيل</h1>
    <p>قهوة عربية محمّصة ومطحونة مع الهيل.</p>
  </body>
</html>
```

## How to fix

Put the `html` tag at the top of the page and the head tags inside `<head>`. Every page needs its own title, description and address:

```html
<html lang="ar" dir="rtl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>قهوة عربية بالهيل | متجر الواحة</title>
<meta name="description" content="قهوة عربية محمّصة تحميصاً خفيفاً ومطحونة مع الهيل، تُشحن خلال يومين.">
```

- Write a title of the page’s subject, then the site’s name, and a description of one or two sentences.
- Give each page its own canonical address, the one you want in search.
- Use an image about 1200 pixels wide for sharing, at a full `https://` address.
- On a platform, paste the title and description into its SEO fields instead of the head: the theme writes the tags.

## FAQ

### How long should the title and the description be?

Google does not give a length: it cuts a title by its width and may rewrite both. Keep the title short enough to show whole in the result preview, and the description to a sentence or two that says what the page offers.

### Do I need all the sharing tags?

No page needs them to be indexed, but a link shared without them shows without a picture or a good title. `og:title`, `og:description` and `og:image` are the three the sharing check asks for.

### Does what I type reach Arablyzer?

No. The generator runs in your browser, and nothing you type leaves it.

## Methodology

The generator runs in your browser. It writes the tags the title and description check (`title-missing`, `meta-description-missing`), the sharing-tags check (`og-tags-missing`) and the viewport check (`viewport-missing`) read, and a test runs those checks over what it writes. Text is escaped before it goes in an attribute. The locale `ar_AR` and `en_US` are the ones Facebook documents.
