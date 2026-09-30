---
summary: Is your page wider than a phone screen, so it slides left and right?
---

# Horizontal overflow checker

Renders your Arabic page at a phone's width in three browsers, and shows whether it is wider than the screen and which elements reach past its edge, and by how much.

## What it checks

- The page is no wider than a phone screen (390 pixels), so it does not move sideways under the reader's thumb.
- The elements that reach past the left edge of the screen, the side a right-to-left page scrolls towards, and how many pixels each one reaches past it.
- The result in each engine, Chromium, Firefox and WebKit, with the engines each element showed in.
- Pages made for phones: laid out right to left by `dir` on `<html>` or `<body>`, with `width=device-width` in their viewport meta.

## Example

### Wrong

```html
.drawer {
  position: absolute;
  top: 0;
  left: -280px;
  width: 260px;
}
```

### Right

```html
.drawer {
  position: absolute;
  top: 0;
  inset-inline-start: -280px;
  width: 260px;
}
```

## How to fix

Place elements with logical properties, which follow the direction of the page, and keep wide content within the screen:

```html
<style>
  /* The closed menu past the start edge: the right one on an Arabic page */
  .drawer {
    position: absolute;
    inset-inline-start: -280px;
  }
  img,
  video {
    max-width: 100%;
  }
  .table-wrap {
    overflow-x: auto;
  }
</style>
```

- In a design written for left to right, replace `left` with `inset-inline-start`, `margin-left` with `margin-inline-start` and `padding-right` with `padding-inline-end`, so positions mirror with the page's direction.
- Hide a closed menu with the `hidden` attribute or `display: none`, not by placing it off screen.
- Put a wide table inside a container with `overflow-x: auto`, so the container scrolls instead of the whole page.

## FAQ

### Why does the Arabic version scroll sideways when the English one does not?

A page can never be scrolled past its start edge: the left edge in left-to-right pages, the right edge in right-to-left ones. So an element hidden past the left edge, as left-to-right designs often hide a closed menu, stays hidden in English and becomes reachable once the page is flipped, and the page widens by that much. What lies past the right edge of an Arabic page cannot be scrolled to, so the tool does not count it.

### Why does the tool not apply to my page?

It applies to pages laid out right to left whose viewport meta sets `width=device-width`, the sign of a page made for a phone's width. If your page is made for phones, add the tag to its `<head>`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

### What screen width and browsers does it use?

One phone-sized window, 390 pixels wide and 844 high, in Chromium, the engine of Chrome and Edge, in Firefox, and in WebKit, Safari's engine. We run WebKit on Linux, so it is close to Safari but not the same. A narrower screen can show overflow that this width does not.

## Methodology

We fetch the page as `ArablyzerBot` and render it in Chromium, Firefox and WebKit in a phone-sized window 390 pixels wide, with every request going through a proxy that refuses private addresses. The tool applies to pages laid out right to left, by `dir` on `<html>` or `<body>`, whose viewport meta sets `width=device-width`. When the page is more than one pixel wider than the window, we name the elements that reach past its left edge and measure how far each one reaches. Elements past the right edge, elements with a fixed position and elements inside another element that clips its content do not count; when no element can be named, there is one finding for the page. The same page gives the same result on every check.
