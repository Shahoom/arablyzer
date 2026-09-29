---
summary: Are the images on your page heavier than they need to be, in older formats?
---

# Image size checker

Renders your page in three browsers and finds the JPEG, PNG and BMP images that would be much smaller as AVIF or WebP, with each one's size now and its estimate as AVIF.

## What it checks

- The images the browser drew on the page, and the file it chose for each: its format, size and dimensions in pixels.
- Images in JPEG, PNG or BMP whose file is larger than their estimated size as AVIF by 8,192 bytes or more.
- Each image once, at the first element that shows it, with its current size and its estimated size as AVIF.

## Example

### Wrong

```html
<main>
  <h1>نقش السدو</h1>
  <p>نقش السدو من نسيج البادية، بألوانه الحمراء والرملية.</p>
  <img src="/images/sadu.png" width="128" height="128" alt="نقش سدو أحمر ورملي" />
</main>
```

### Right

```html
<main>
  <h1>نقش السدو</h1>
  <p>نقش السدو من نسيج البادية، بألوانه الحمراء والرملية.</p>
  <img src="/images/sadu.webp" width="128" height="128" alt="نقش سدو أحمر ورملي" />
</main>
```

## How to fix

Convert images to AVIF or WebP, with a tool such as Squoosh or your content delivery network's image service, and serve them with `<picture>` and a fallback for older browsers:

```html
<picture>
  <source srcset="sadu.avif" type="image/avif" />
  <source srcset="sadu.webp" type="image/webp" />
  <img src="sadu.jpg" width="128" height="128" alt="Sadu pattern" />
</picture>
```

- The browser loads the first `<source>` whose format it can show, so put AVIF first, then WebP, and keep JPEG or PNG in the `<img>` for browsers that show neither.
- Icons and simple drawings suit SVG.

## FAQ

### Should I use AVIF or WebP?

Both store the same image in far fewer bytes than JPEG and PNG, and every current browser shows them: Chrome, Firefox, Safari and Edge. You do not have to choose: put both in `<picture>`, and each browser loads the first format it can show.

### How does the tool estimate an image's size as AVIF?

From the file's pixels: 2 bytes per pixel, compressed 12 to 1, the estimate Lighthouse 12 used for an image it could not re-encode. It is an estimate, not a measurement: the size after converting depends on the image and the quality you choose.

### Is compressing an image enough, without changing its format?

It can be. An image fails when its file is larger than its estimated size as AVIF by 8,192 bytes or more; below that, it passes in any format, JPEG included.

## Methodology

We fetch the page as `ArablyzerBot`, following its redirects, then render it in Chromium, Firefox and WebKit, each behind Arablyzer's egress proxy. In each engine we read the images it drew and the file it chose for each: its format as the server declares it in its response, its size, and its dimensions in pixels (the file's own, not the size it is drawn at). For an image in JPEG, PNG or BMP, we estimate its size as AVIF at 2 bytes per pixel, compressed 12 to 1; it fails when its file is larger than that by 8,192 bytes or more, Lighthouse 12's own limit. GIF is left out, as Lighthouse 12 left it out. The same page gives the same result on every check.
