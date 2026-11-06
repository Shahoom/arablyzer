---
summary: Does your images' alt text describe them, or is it a file name?
---

# Image alt text quality checker

Give the address of a page and this tool reads the alt text of its images and tells you which are a file name (`IMG_2045.jpg`), a word that only names the kind of thing («صورة», “image”), or a description that begins by saying it is a picture. An image with no alt at all is for the accessibility checks.

## What it checks

- Alt text that is a file name: it ends in an image extension, or begins with `IMG`, `DSC`, `photo` or `screenshot` and a number.
- Alt text that is only a word like “image”, “photo”, “logo”, «صورة», «شعار».
- Alt text that begins “image of…” or «صورة لـ…», which a screen reader already says.
- An empty `alt=""` is right for a decoration and is not flagged.

## Example

### Wrong

```html
<img src="/img/royal-oud.jpg" alt="IMG_2045.jpg">
```

### Right

```html
<img src="/img/royal-oud.jpg" alt="زجاجة عطر العود الملكي بحجم 50 مل">
```

## How to fix

Describe what the image shows, in the page's language:

```html
<img src="/img/royal-oud.jpg" alt="زجاجة عطر العود الملكي بحجم 50 مل">
```

- Say what matters about the image where it sits on the page: the product, the person, what the chart shows.
- Leave `alt=""` on a decoration, not a missing alt.
- Do not start with «صورة» or “image of”.
- On a platform, fill the alt text field when you upload the image.

## FAQ

### How long should alt text be?

As long as it takes to say what the image is for, usually a short phrase. There is no number to reach.

### Does alt text help search?

Google uses it to understand an image, with the text around it and the file name. A description helps it more than a file name does.

### What about my logo?

Its alt text is your brand's name, not «شعار». An image that is a link says where the link goes.

## Methodology

The check reads the `alt` text of the images, image areas and image buttons in the HTML of the page (the first and last hundred or so of the page) and sorts it by the patterns above. The patterns are short lists Arablyzer keeps; a description that happens to start with «صورة» may be flagged.
