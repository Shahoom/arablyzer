# Share image is not a full address the apps can draw

## Messages

### relative

The `{tag}` is a relative address (“{image}”); sharing apps need the full address with `https://`.

### insecure

The `{tag}` is an http address (“{image}”); some apps refuse to draw an image that is not over https.

### unsupported

The `{tag}` is in a format sharing apps do not draw (“{image}”); use a JPEG, PNG or WebP file.

## Why it matters

- The picture beside a link shared in WhatsApp, X, Facebook or Telegram comes from this tag. Without it, or with an address the app cannot fetch, the link is shown as plain text and clicked less.
- A relative address (`/images/oud.jpg`) means nothing to an app that reads the tag without the page's address. Apps fetch the picture from a server, so it must be reachable by a full `https://` address.
- SVG and ICO files are not drawn in the preview; neither are some modern formats on every app.
- Arabic stores are shared mostly in WhatsApp groups: a link with no picture does not get opened.

## How to fix

Give the full address of a JPEG or PNG, at least 1200 × 630 pixels:

```html
<meta property="og:image" content="https://www.example.com/images/royal-oud.jpg" />
<meta name="twitter:image" content="https://www.example.com/images/royal-oud.png" />
```

- Print the full address from the product's main image, with the store's domain.
- Serve the image over https and keep it public: a picture behind a login is not fetched.
- For products, use the product photo, not the logo.
- After changing it, clear the preview cache in the app: WhatsApp and Facebook keep the old one for a while.

## How we detect

1. We read `og:image`, `og:image:url`, `og:image:secure_url`, `twitter:image` and `twitter:image:src`, with `property` or `name`.
2. An image is flagged when it does not start with a scheme (a relative or protocol-relative address), when it starts with `http:`, or when its path ends in `.svg`, `.ico`, `.avif`, `.bmp` or `.tiff`. A tag with no address is the image missing, which the rule about the Open Graph tags reports.

We do not fetch the image, so its size and whether it opens are not checked.

## References

- [The Open Graph protocol: og:image](https://ogp.me/#structured)
- [X Developer Platform: Cards markup (twitter:image)](https://developer.x.com/en/docs/x-for-websites/cards/overview/markup)
- [Facebook for Developers: Sharing best practices (images)](https://developers.facebook.com/docs/sharing/best-practices)
