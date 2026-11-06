---
reviewed: false
---

# Viewport meta tag

The viewport meta tag tells a phone's browser how wide to make a page; without it the page may be laid out wider than the screen and shrunk, so visitors must zoom in.

## Definition

- The `<meta name="viewport">` tag gives the browser hints about how to size the viewport. Its value, in the `content` attribute, is a list of `key=value` pairs separated by commas (MDN).
- MDN explains that some mobile devices lay a page out in a virtual window wider than the screen, then shrink the result to fit. Its example is a screen `640px` wide that might render a page in a `980px` virtual window and scale it down.
- The setting MDN recommends is `width=device-width`, which makes the viewport as wide as the device's screen. web.dev recommends `width=device-width, initial-scale=1`; `initial-scale=1` sets a 1:1 relationship between CSS pixels and device-independent pixels.
- Other properties, such as `minimum-scale`, `maximum-scale` and `user-scalable`, limit how far a visitor can zoom.

## Why it matters

- A page designed for narrow screens with media queries breaks down without the tag. MDN says that if the virtual window is `980px`, media queries that kick in at `640px` or `480px` and below never apply.
- web.dev says that without the tag, mobile browsers lay a page out at a desktop-like width and scale it to fit the screen, so font sizes come out inconsistent and visitors often have to zoom to read and interact.
- Google uses the mobile version of a site for indexing and ranking, and recommends responsive design, where the site serves the same code on the same URL to every device.
- The `viewport-missing` rule and the viewport checker read the tag in the HTML exactly as the server sends it. They accept `width=device-width`, or `initial-scale` with no width, because the browser then takes the device's width. They do not render the page.

## Example

The tag in `<head>`, and a CSS rule that will not apply on a phone unless the tag is there, since the viewport may stay wider than its breakpoint:

```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>متجر الواحة</title>
</head>
```

```css
@media (max-width: 640px) {
  .menu { display: none; }
}
```

In themes the tag is usually in the header file: `header.php` in WordPress and `theme.liquid` in Shopify.

## Common mistakes

- Fixing a width such as `width=1024`: it forces the page to a width larger than most phone screens, so a horizontal scrollbar appears.
- Adding `user-scalable=no` or `maximum-scale=1`: MDN warns that blocking zoom stops people with low vision from reading the content, and notes that WCAG requires at least 2× scaling. web.dev advises leaving these properties out.
- Relying on responsive CSS without the tag, so it does not apply on the phone as written.
- Separating properties with a space instead of a comma: web.dev advises commas so older browsers parse them.
- Treating a missing `initial-scale=1` as an error: MDN calls omitting it common and usually unnecessary, though the browser may zoom out if content overflows horizontally.

## References

- [MDN: Viewport meta element](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Viewport_meta_element)
- [web.dev: Responsive web design basics](https://web.dev/articles/responsive-web-design-basics)
- [Google Search Central: Mobile-first indexing best practices](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing)
