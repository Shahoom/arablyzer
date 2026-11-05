---
summary: See how your title and description read in a search result, in Arabic and right to left.
---

# Search result preview

Type a page's title, description and address and see them as a search result shows them: the address as crumbs, the title as a link and the description under it, set right to left when they are Arabic. The title is cut by its width, as a result cuts it.

## What it checks

- The title as a result shows it, cut by its width in pixels, measured in your browser, where a result would end it with an ellipsis.
- The description, cut by its length.
- The address as crumbs: the site, then the path’s parts after a ›, with an Arabic path shown in Arabic.
- That the page has a title and a description at all, which is what the page checks ask.

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
    <meta name="description" content="قهوة عمانية مطحونة مع الهيل، في علب من نصف كيلو، تُشحن خلال يومين.">
  </head>
  <body>
    <h1>قهوة عمانية بالهيل</h1>
    <p>قهوة عمانية مطحونة مع الهيل، في علب من نصف كيلو.</p>
  </body>
</html>
```

## How to fix

Write the title and the description for people first, and read them here before you publish:

```html
<title>قهوة عمانية بالهيل | متجر الواحة</title>
<meta name="description" content="قهوة عمانية مطحونة مع الهيل، في علب من نصف كيلو، تُشحن خلال يومين.">
```

- Put what the page is about first in the title, and the site’s name last, so a cut takes the name and not the subject.
- Write a description that tells the reader what they will get, in one or two sentences.
- Do not repeat the title in the description, and do not fill either with keywords.
- Google may show a different title or description from the page’s own when it judges they answer the search better.

## FAQ

### Is the preview exactly what Google shows?

No. It is an approximation: Google cuts a title by its width, may rewrite the title and description, and shows them differently on a phone. The width limit we use is the one search tools commonly use, not a number from Google.

### Why is my Arabic title cut earlier or later than an English one?

Letters are different widths in different fonts, and the preview measures with your browser’s font. A result is drawn in Google’s font, so a title near the limit can differ.

### Does what I type reach Arablyzer?

No. The preview runs in your browser, and nothing you type leaves it.

## Methodology

The preview runs in your browser. It measures the title’s width with the browser’s canvas in a 20-pixel sans-serif font and cuts it at 600 pixels, and cuts the description at 160 characters: both are the conventions search tools use, not numbers from Google. The page checks (`title-missing`, `meta-description-missing`) are the ones Arablyzer runs on a page.
