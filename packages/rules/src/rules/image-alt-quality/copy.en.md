# Image alt text that does not describe the image

## Messages

### filename

{count} images have a file name as their alt text, such as «{alt}».

### generic

{count} images have a word that only names the kind of thing as their alt text, such as «{alt}».

### prefix

{count} images have alt text that begins by saying it is a picture, such as «{alt}».

## Why it matters

- A screen reader reads the alt text in place of the image. «IMG_2045.jpg» or «صورة» tells a blind visitor nothing about it, and a visitor with images switched off or a slow connection sees the same.
- A search engine uses the alt text to understand what an image shows and what it is about, so a file name wastes the one line it gives you for that.
- A screen reader already announces that something is an image: «image of…» and «صورة لـ…» make it say so twice.

## How to fix

Describe what the image shows, in the page's language and in the words a person would use:

```html
<img src="/img/royal-oud.jpg" alt="زجاجة عطر العود الملكي بحجم 50 مل" />
```

- Say what matters about the image in its place on the page: the product, the person, what the chart shows.
- Leave `alt=""` (empty, not missing) on an image that only decorates; a screen reader then skips it.
- Do not start with «صورة» or "image of".
- On a platform, fill the image's alt text field when you upload it; many themes copy the file name into it when it is empty.

## How we detect

1. We read the `alt` text of the images, image areas and image buttons in the page's HTML (the first and last 100 or so of the page).
2. `filename`: it ends in an image extension, or begins with `IMG`, `DSC`, `photo`, `screenshot` and the like followed by a number.
3. `generic`: it is only one of: image, photo, picture, graphic, banner, logo, icon, صورة, شعار, أيقونة.
4. `prefix`: it begins with "image of", "photo of", «صورة لـ», «صورة عن» or «لقطة لـ» followed by something.
5. One finding for each kind, with how many and the first. A missing `alt` is for the accessibility checks.

## References

- [W3C: an alt decision tree](https://www.w3.org/WAI/tutorials/images/decision-tree/)
- [Google Search Central: image best practices (alt text)](https://developers.google.com/search/docs/appearance/google-images#descriptive-alt-text)
