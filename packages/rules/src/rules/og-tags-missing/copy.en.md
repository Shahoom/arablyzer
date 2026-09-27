# Open Graph sharing tags are missing

## Messages

### title

The page has no `{tag}` tag with text, so the link's preview, when it is shared, takes a title the app picks from the page.

### description

The page has no `{tag}` tag with text, so the link's preview, when it is shared, may show no description, or text the app picks from the page.

### image

The page has no `{tag}` tag with an image URL, so the link's preview, when it is shared, shows no image, or an image the app picks from the page.

## Why it matters

- **When a link is shared** in WhatsApp, Facebook, LinkedIn, Telegram and others, the app shows a preview with a title, a description and an image, which it takes from the page's Open Graph tags.
- Without these tags the app picks what it finds on the page, or shows the bare link, so the share looks less clear and less inviting.
- The image is what catches the eye in a preview, and a link without one is easy to scroll past.

## How to fix

Add the three tags inside `<head>`, with what suits each page:

```html
<meta property="og:title" content="Omani sidr honey" />
<meta property="og:description" content="Natural Omani sidr honey, in half-kilo jars." />
<meta property="og:image" content="https://www.example.com/sidr-honey.jpg" />
```

- Write the image's full URL, starting with `https://`, and use an image that stands for the page, such as the product's photo.
- Most SEO plugins in WordPress, and platforms such as Salla, Zid and Shopify, add these tags from the page's title, description and featured image, so check that those fields are filled in.

## How we detect

1. We read the page's HTML as the server sends it, without running JavaScript.
2. We look for the `<meta>` tags of `og:title`, `og:description` and `og:image` in the `property` attribute, or in the `name` attribute, which some sites write and apps read as well, in any letter case.
3. We report each tag that is missing or empty, each in a finding of its own.

## References

- [The Open Graph protocol](https://ogp.me/)
- [Meta for Developers: Sharing for webmasters](https://developers.facebook.com/docs/sharing/webmasters/)
