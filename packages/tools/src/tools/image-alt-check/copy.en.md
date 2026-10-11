---
summary: Do your images have an alt text that a screen reader and Google can read, in Arabic?
---

# Image alt text checker

Renders a page in three browsers and finds the images with no text alternative: no `alt`, `aria-label` or `aria-labelledby`, and not marked as decorative. A screen reader skips such an image or reads out its file name, and search engines learn nothing from it.

## What it checks

- Each image of the page that has no accessible name, using axe-core's `image-alt` rule in Chromium, Firefox and WebKit.
- That an image marked decorative with `alt=""` or `role="presentation"` is left alone.
- That a page without images has nothing to check.

## Example

### Wrong

```html
<img
  id="product"
  src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC"
  width="160"
  height="160"
/>
```

### Right

```html
<img
  id="product"
  src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC"
  alt="زجاجة عطر العود الملكي"
  width="160"
  height="160"
/>
```

## How to fix

1. Give every image that carries content an `alt` that says what it shows, in the page's language: «زجاجة عطر العود الملكي», not «صورة» or the file name.
2. Mark decorative images (borders, spacers, repeated icons beside a text label) with `alt=""`.
3. For an image that is a link or a button, the `alt` says where it goes or what it does.
4. In a store, the product's image alt comes from a field in the product (often "alt text" in the media panel); fill it, or let the theme use the product's name.
5. Do not stuff the `alt` with keywords: one honest phrase.

## FAQ

### Does alt text help SEO?

Google uses it to understand an image, and it is the text of an image that cannot load. It is not a ranking trick: write it for the person who cannot see the picture.

### Should the alt be in Arabic?

Yes, in the page's language. A screen reader pronounces it in the page's language; an English alt on an Arabic page is read with the wrong voice.

### How is this different from the accessibility checker?

That runs six accessibility rules at once. This one runs the image rule alone, so you can see just that problem and fix it first.

### The check is slow. Why?

Because it renders the page in three browsers and runs axe-core in each. The result is the same in all three; the tool reports each image once.

## Methodology

We render the page in Chromium, Firefox and WebKit and run axe-core 4.13.0 with its `image-alt` rule. Each image without a text alternative is reported; images marked decorative are not. See the rule's page for the details.
