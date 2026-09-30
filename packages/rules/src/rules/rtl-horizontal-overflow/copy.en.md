# Right-to-left page wider than a phone screen

## Messages

### element

This element reaches {overflow} pixels past the edge of a phone screen {viewportWidth} pixels wide, so the page scrolls sideways.

### page

The page is {scrollWidth} pixels wide on a phone screen {viewportWidth} pixels wide, so it scrolls sideways.

## Why it matters

- **A page that moves sideways under the thumb feels broken:** while reading, it slides left and right, and part of it is out of view.
- **Right-to-left pages are more exposed to it.** A page can never be scrolled past its start edge, which is the left edge in left-to-right pages and the right edge in right-to-left ones. So an element hidden past the left edge, as left-to-right designs often hide a closed menu, stays hidden in English and becomes reachable in Arabic, and the page widens by that much.
- **It often comes from a design written for left to right:** positions such as `left` and `margin-left` that were not mirrored when the page was flipped.

## How to fix

- Use logical properties such as `inset-inline-start`, `margin-inline-start` and `padding-inline-end`, which follow the direction of the page. An element placed past the start edge stays out of reach in both directions:

```css
.drawer {
  position: absolute;
  inset-inline-start: -280px;
}
```

- Hide a closed menu with the `hidden` attribute or `display: none`, not by placing it off screen.
- Keep wide content within the screen: `max-width: 100%` for images and videos, and a container with `overflow-x: auto` around wide tables.

## How we detect

1. The rule applies to pages laid out right to left, by `dir` on `<body>` or on `<html>`, whose viewport meta sets `width=device-width`, the sign of a page made for the phone's width. We render them 390 pixels wide.
2. When the page is wider than the screen, we list the elements that reach past its left edge, the side a right-to-left page scrolls towards. What lies past the right edge cannot be scrolled to, so it does not count. Elements inside another element that clips its content, and elements with a fixed position, do not count.
3. There is one finding per element, with how far it reaches past the edge. When no element can be named, there is one finding for the page.

## References

- [W3C: CSS Overflow Module Level 3, scrollable overflow](https://www.w3.org/TR/css-overflow-3/#scrollable)
- [W3C: CSS Logical Properties and Values Level 1, flow-relative offsets](https://www.w3.org/TR/css-logical-1/#position-properties)
