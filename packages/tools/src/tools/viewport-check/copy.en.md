---
summary: Does your page tell phones to use their own width, or does it show tiny and make visitors zoom?
---

# Mobile viewport checker

Reads a page's `<meta name="viewport">` tag and tells you whether phones will lay the page out at their own width. Without it, a phone draws the page at a computer's width and shrinks it, the text is tiny, and visitors zoom and scroll sideways.

## What it checks

- That the page has a `<meta name="viewport">` tag.
- That the tag asks for the device's width (`width=device-width`), or sets `initial-scale`, which makes the browser take the device's width.
- That the tag does not fix a width, such as `width=1024`.

## Example

### Wrong

```html
<meta charset="utf-8" />
<title>لبان حوجري | متجر الواحة</title>
```

### Right

```html
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>لبان حوجري | متجر الواحة</title>
```

## How to fix

1. Add the tag inside `<head>`: `<meta name="viewport" content="width=device-width, initial-scale=1" />`.
2. If the tag has a fixed width, replace it with `width=device-width`, and make the page fit any width.
3. In WordPress, the tag is in the theme's `header.php`; in Shopify, `theme.liquid`. Salla and Zid themes include it, so a missing tag points to a custom template.
4. Do not set `user-scalable=no` or `maximum-scale=1`: they stop visitors who need to zoom.
5. Test on a phone, and check that nothing scrolls sideways (the right-to-left overflow checker looks for that).

For example:

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

## FAQ

### Does Google care about this?

Yes. Google indexes the phone version of a page. A page that does not suit a phone gives searchers a poor experience, and mobile usability reports flag it.

### My theme is responsive. Why is the tag missing?

Responsive CSS does not work without the tag: the phone does not know to apply it. Some page builders or caching plugins remove the tag; look for a plugin that rewrites the `<head>`.

### Is `initial-scale=1` alone enough?

Yes. Browsers then take the device's width. The tool accepts it, and `width=device-width` with or without it.

### Does the check render the page?

No. It reads the tag in the HTML. To check the page at phone widths, use the right-to-left overflow checker, which renders it.

## Methodology

We read the first `<meta name="viewport">` in the page's HTML as the server sends it and split its properties as browsers do: on commas, semicolons and spaces, in any letter case. The tag passes with `width=device-width`, or with no width but an `initial-scale`; it fails when it is missing, sets another width, or sets neither. See the rule's page for the details.
