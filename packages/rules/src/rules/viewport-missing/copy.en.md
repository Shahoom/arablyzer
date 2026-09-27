# The page is not set up for phone screens (viewport)

## Messages

### missing

The page has no `<meta name="viewport">` tag, so phone browsers lay it out at a computer screen's width and then shrink it.

### no-device-width

The page's viewport tag does not make its width the device's width (`{content}`), so the page does not fit a phone screen as it should.

## Why it matters

- **On phones**, when a page does not ask for the device's width, the browser lays it out at a width that suits a computer screen and then shrinks it. The text gets small, and visitors have to zoom and scroll sideways to read.
- **In search**, Google indexes the phone version of a page, so a page that does not suit phones gives searchers a poor experience.
- A fixed width, such as `width=1024`, forces the page to be wider than most phone screens, so it scrolls sideways.

## How to fix

Add this tag inside `<head>`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

- If the tag has a fixed width such as `width=1024`, replace it with `width=device-width`, and design the page to fit any width.
- Most modern themes have this tag in the page header template, such as `header.php` in WordPress or `theme.liquid` in Shopify.

## How we detect

1. We read the page's HTML as the server sends it, without running JavaScript.
2. We read the first `<meta name="viewport">` tag and split its properties as browsers do: on commas, semicolons and spaces, in any letter case.
3. The rule passes when it has `width=device-width`, or sets no width but sets `initial-scale`, since the browser then takes the device's width. It fails when the tag is missing, sets another width, or sets neither.

## References

- [Google Search Central: Mobile-first indexing best practices](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing)
- [MDN: The viewport meta tag](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Viewport_meta_element)
