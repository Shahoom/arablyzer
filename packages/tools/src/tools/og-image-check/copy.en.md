---
summary: Will the picture show when your link is shared in WhatsApp, X or Facebook, or is its address relative, http or an SVG?
---

# Share image checker (og:image)

Reads the image tags that decide the picture beside a shared link, `og:image` and `twitter:image`, and checks the address the sharing apps will fetch: a full `https://` address of a file format they draw. It also reports a page with no title, description or image tag at all.

## What it checks

- That `og:image` and `twitter:image` are full addresses, not paths such as `/images/oud.jpg` that only the page can resolve.
- That the address is over https, not http.
- That the file is a format sharing apps draw: JPEG, PNG or WebP, and not SVG, ICO or AVIF.
- That the page has the three Open Graph tags (`og:title`, `og:description`, `og:image`) with something in them.

## Example

### Wrong

```html
<meta property="og:image" content="/images/royal-oud.jpg" />
<meta name="twitter:image" content="http://www.example.com/images/royal-oud.svg" />
```

### Right

```html
<meta property="og:title" content="عطر العود الملكي" />
<meta property="og:description" content="عطر عود ملكي بتركيز عالٍ." />
<meta property="og:image" content="https://www.example.com/images/royal-oud.jpg" />
<meta name="twitter:image" content="https://www.example.com/images/royal-oud.png" />
```

## How to fix

1. Print the full address of the product or page image, with `https://` and the domain, in `og:image`, and the same or a PNG in `twitter:image`.
2. Use JPEG or PNG, at least 1200 × 630 pixels, under a few megabytes, and public: an image behind a login is not fetched.
3. For a product, use its main photo; for the home page, a clear banner or the logo on a plain ground.
4. After changing it, clear the preview in the app: WhatsApp keeps the old picture for a while, and Facebook's Sharing Debugger refreshes it.
5. On Salla, Zid and Shopify the theme or the SEO app writes these tags from the product's image; set the main image of each product and the store's default share image in the SEO settings.

For example:

```html
<meta property="og:image" content="https://www.example.com/images/royal-oud.jpg" />
```

## FAQ

### Why does my link show no picture in WhatsApp?

Usually because `og:image` is missing or relative, the file is too large or blocked, or the app has cached an older answer. This tool checks the first two; the last needs a refresh.

### Does the tool check the size of the picture?

No. It does not fetch the image. A picture smaller than 600 pixels may be shown small or not at all by some apps.

### Is `twitter:image` needed if I have `og:image`?

X (Twitter) falls back to `og:image` when `twitter:image` is missing. Set both only to give X a different crop.

### What does the "Right" example not show?

The text and size of the image itself. Open the address in a browser and look at the picture the way the app will see it.

## Methodology

We read the meta tags `og:image`, `og:image:url`, `og:image:secure_url`, `twitter:image` and `twitter:image:src` in the HTML as the server sends it, with `property` or `name`. An address is faulted when it has no scheme, starts with `http:` or ends in a format sharing apps do not draw. The tags `og:title`, `og:description` and `og:image` must each have content. Nothing is fetched. See each rule's page for the details.
