# Images in older formats

## Messages

### legacy

The image {url} is a {format} of {size} KB. As AVIF, it is estimated at about {avif} KB.

## Why it matters

- AVIF and WebP are newer than JPEG, PNG and GIF, and store the same image in far fewer bytes.
- Every current browser shows them: Chrome, Firefox, Safari and Edge.
- And images are often the heaviest part of a page, so making them smaller is one of the quickest ways to speed it up.

## How to fix

Convert images to AVIF or WebP, with a tool such as Squoosh or your content delivery network's image service, and serve them with `<picture>` and a fallback for older browsers:

```html
<picture>
  <source srcset="sadu.avif" type="image/avif" />
  <source srcset="sadu.webp" type="image/webp" />
  <img src="sadu.jpg" width="128" height="128" alt="Sadu pattern" />
</picture>
```

- Icons and simple drawings suit SVG.

## How we detect

1. We render the page and read the images the browser drew, with each file's format and size.
2. For an image in JPEG, PNG or GIF, we estimate its size as AVIF from its dimensions as Lighthouse 12 did: 2 bytes per pixel, compressed 12 to 1.
3. The rule fails when the file is larger than that estimate by 8,192 bytes or more: Lighthouse 12's own limit.
4. We report each image once, at the first element that shows it.

## References

- [MDN: Image file types](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)
- [Chrome: Serve images in modern formats](https://developer.chrome.com/docs/lighthouse/performance/uses-webp-images)
- [MDN: The picture element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/picture)
