# Open Graph

Open Graph is a set of meta tags, such as og:title and og:image, that apps like WhatsApp and Facebook read to build a link’s preview when it is shared.

## Definition

- The Open Graph protocol, originally created at Facebook, describes a page as an object with a title, a type, an image and a URL. Its tags are `<meta>` elements in the page’s `<head>`, each with a `property`, such as `og:title`, and a `content`.
- ogp.me names four properties every page needs: `og:title`, `og:type`, `og:image` and `og:url`. Optional ones include `og:description`, `og:site_name`, `og:locale`, and `og:image:alt` to describe the image.

## Why it matters

- A shared link shows as a preview with a title, a description and an image, taken from these tags. Without them, Facebook’s crawler makes a best guess from the page.
- WhatsApp asks for `og:title`, `og:description` and `og:url` in `<head>`, not empty, and for `og:image` as an absolute URL to an image under 600KB, at least 300 pixels wide and at most four times as wide as it is tall. The `<head>` must come within the first 300KB of the HTML.
- For Arabic pages, `og:locale` defaults to `en_US`, so declare the page’s own. Meta uses `ar_AR` as its umbrella locale for Arabic.

## Example

The tags of an Arabic product page, with its English version as an alternate locale:

```html
<meta property="og:title" content="عسل السدر العماني">
<meta property="og:description" content="عسل سدر عماني طبيعي، في عبوات من نصف كيلو.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://example.com/sidr-honey">
<meta property="og:image" content="https://example.com/images/sidr-honey.jpg">
<meta property="og:image:alt" content="عبوة عسل سدر على طاولة خشبية">
<meta property="og:site_name" content="متجر الواحة">
<meta property="og:locale" content="ar_AR">
<meta property="og:locale:alternate" content="en_US">
```

## Common mistakes

- A relative image path, such as `/images/honey.jpg`, where WhatsApp asks for an absolute URL.
- A new image under the old URL: Facebook caches images by URL, and updates them only when the URL changes.
- The site’s name in `og:title`: Meta and WhatsApp ask for the title without branding, and the name has `og:site_name`.
- Large inline styles or scripts before the tags, which can push them out of the first 300KB of the HTML, where WhatsApp asks for them.

## References

- [The Open Graph protocol](https://ogp.me/)
- [Meta for Developers: Sharing for webmasters](https://developers.facebook.com/docs/sharing/webmasters/)
- [Meta for Developers: WhatsApp link previews](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/)
- [Meta for Developers: Localization](https://developers.facebook.com/docs/javascript/internationalization)
