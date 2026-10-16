---
summary: Do your arrows point the right way in Arabic: next left, back right?
---

# Next and previous arrows direction checker

Renders a page and finds the "next" and "previous" controls (carousels, numbered pages, steps) whose icon points the wrong way for right-to-left reading: a "next" arrow that points right, a "back" arrow that points left.

## What it checks

- Controls whose label, `rel` or class says "next" («التالي», «المزيد», `next`) or "back" («السابق», «رجوع», `prev`) in a right-to-left context.
- The direction of the icon inside: a Font Awesome, Bootstrap Icons, Lucide or Material icon name, an SVG symbol, or an arrow character «→» «←».
- Whether the icon is mirrored by CSS (a transform, or the opposite icon in right-to-left).

## Example

### Wrong

```html
<a href="/offers" class="next">التالي <span class="icon-arrow-right"></span></a>
```

### Right

```html
<a href="/offers" class="next">التالي <span class="icon-arrow-left"></span></a>
```

## How to fix

1. On Arabic pages, "next" points left and "previous" points right. Use the opposite icon, or mirror it with CSS (below).
2. In sliders (Swiper, Slick, Owl), turn on the library's right-to-left option and test the arrows.
3. Prefer logical icon names (`arrow-forward`, `chevron-end`) or CSS that flips the icon with the direction.
4. Do not mirror icons that are not about direction: a clock, a search glass, a logo.
5. Test on a phone: tap each arrow and see that it moves the way it points.

The mirroring in step 1, in CSS:

```css
[dir='rtl'] .icon-arrow-right,
[dir='rtl'] .icon-arrow-left {
  transform: scaleX(-1);
}
```

## FAQ

### Why do browsers not flip the arrows?

Because an icon is an image or a character; the browser flips the layout, not what is drawn in it. Icon libraries and sliders draw their arrows for English pages.

### Should the whole page icon set be mirrored?

No, only icons that show direction (arrows, chevrons, "back", "forward", "reply"). Icons for things in the real world are not mirrored.

### My slider has no text label. Does the check see it?

It looks at `aria-label`, `title`, the text, `rel` and the class. A control with no such word is not judged; give your arrows an `aria-label`, which they need for screen readers anyway.

### Does it click the arrows?

No. It renders the page and reads the icons and styles. Nothing is clicked.

## Methodology

We render the page in three browsers and look, in controls read right to left, for a role in their label, `rel` or class, and for an icon of known direction in them. A control is reported when every icon in it points against its role. A control with no icon of known direction, whose label has both roles, or that reads left to right, is not judged. See the rule's page for the details.
