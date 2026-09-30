---
summary: Does your page have a main heading (h1) for screen readers and search engines?
---

# H1 heading checker

Checks that your page has an h1 main heading with text, from which screen readers and search engines learn its topic, reading images inside it by their alt text.

## What it checks

- The page has at least one `<h1>` element.
- At least one `<h1>` element is not empty: it has text, or an image with alternative text in `alt`.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <title>حلوى عمانية بالزعفران | متجر الواحة</title>
  </head>
  <body>
    <main>
      <h2>حلوى عمانية بالزعفران</h2>
      <p>حلوى عمانية بالزعفران والهيل، في علب من كيلو.</p>
      <h2>طريقة الحفظ</h2>
      <p>تُحفظ في مكان بارد.</p>
    </main>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <title>حلوى عمانية بالزعفران | متجر الواحة</title>
  </head>
  <body>
    <main>
      <h1>حلوى عمانية بالزعفران</h1>
      <p>حلوى عمانية بالزعفران والهيل، في علب من كيلو.</p>
      <h2>طريقة الحفظ</h2>
      <p>تُحفظ في مكان بارد.</p>
    </main>
  </body>
</html>
```

## How to fix

Put the page's topic in an `<h1>` heading: the product's name, the article's title or the service's name, and the headings of its sections in `<h2>`:

```html
<main>
  <h1>Dhofar incense</h1>
  <p>…</p>
  <h2>How to use it</h2>
  <p>…</p>
</main>
```

- Choose a heading's level by its place in the page's structure, not by its font size; set the size with CSS.
- In ready-made themes, the `<h1>` usually comes from the page's or product's title: check that the field is not empty and that the theme does not turn it into another tag.

## FAQ

### Is more than one `<h1>` on a page a mistake?

No, and this tool does not count it: it is enough for one of them to have text.

### Does a logo inside `<h1>` count as a main heading?

Yes, when the image has alternative text: we read the `<h1>`'s text together with the alternative text of the images in it, as a screen reader does. An image without `alt`, or with `alt=""`, has no text, so the heading stays empty.

### Must the `<h1>` match the page's `<title>`?

The tool does not ask for that. The `<title>` shows in the browser tab and in search results, and the `<h1>` on the page itself; they can be close: the product's name in the `<h1>`, and the product's name then the store's in the `<title>`.

## Methodology

We fetch the page as `ArablyzerBot`, follow its redirects, and read the HTML as the server sends it, before any JavaScript runs, so a heading a script adds after loading is not seen. We collect the `<h1>` elements and read each one's text with the alternative text of the images in it, as a screen reader reads it, then apply one rule: it passes when any of them has text, and fails when there is none or all are empty. The same page gives the same result on every check.
