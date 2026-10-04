# An icon that points against its button

## Messages

### next

The «{label}» control ("next") has an icon that points right (`{name}`). In Arabic, going on is going left, so the icon sends the eye backwards.

### prev

The «{label}» control ("back") has an icon that points left (`{name}`). In Arabic, going back is going right, so the icon sends the eye forwards.

## Why it matters

- Arabic text runs from right to left, so "next", "more" and "continue" point left, and "back" and "previous" point right.
- People read an arrow before they read the word beside it. A "next" arrow that points right looks like "back", and visitors press the wrong control in carousels, numbered pages and steps.
- Icon libraries and sliders draw their arrows for English pages, and the browser does not mirror them by itself.

## How to fix

- Mirror the icon on Arabic pages, or use the opposite icon:

```css
[dir='rtl'] .icon-arrow-right,
[dir='rtl'] .icon-arrow-left {
  transform: scaleX(-1);
}
```

- Or swap the icon in the Arabic template: a left arrow for "next", a right arrow for "back".
- Keep what does not follow the reading direction as it is: a play button, a clock, a picture of a real object.

## How we detect

1. We render the page and look, in controls whose computed direction is right to left, for a role in their label (`aria-label`, `title` or text), their `rel`, or their class: «التالي», «المزيد», «next», «السابق», «رجوع», «back» and the like.
2. We look in the control for an icon whose direction is known: a Font Awesome, Bootstrap Icons or Lucide class such as `fa-arrow-right`, a Material name such as `chevron_left`, an SVG named in a `<use>` or a data attribute, or an arrow character «→» «←».
3. We turn the icon by a mirroring transform on it, on its `::before` or `::after`, or on up to three ancestors, and by a stylesheet that makes the opposite icon draw when the page is read from right to left.
4. We report a control when every icon in it points against its role. A control with no icon of known direction, one whose label has both roles, or one with direction left to right, is not judged.

## References

- [W3C: Arabic and Persian Layout Requirements, mirrored controls](https://www.w3.org/TR/alreq/#h_page_layout)
- [Material Design: bidirectionality](https://m2.material.io/design/usability/bidirectionality.html)
