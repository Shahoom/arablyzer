# Cumulative Layout Shift (CLS)

CLS measures visual stability: how much a page’s content moves unexpectedly while it is in use. Good is 0.1 or less; poor is more than 0.25.

## Definition

- A layout shift happens when a visible element changes its start position from one frame to the next. Its score is the impact fraction times the distance fraction: how much of the viewport the moving elements cover, before and after, and how far they move.
- Shifts less than a second apart, within five seconds at most, form a burst, or session window. CLS is the total score of the largest burst in the page’s life, and has no unit.
- Shifts within 500 milliseconds of a tap, click or key press are expected, and left out. An element that is added, or grows, without moving others is not a shift.
- Good is 0.1 or less and poor is more than 0.25, at the 75th percentile of page loads, on phones and desktops separately.

## Why it matters

- Content that moves makes readers lose their place, or tap the wrong link or button.
- It is the visual stability metric of the Core Web Vitals, which Google’s ranking systems use.
- Web fonts are a common cause: text laid out in a fallback font moves when a web font of another size replaces it. A site that loads an Arabic web font needs a close fallback in `font-family`, adjusted with `size-adjust`, or `font-display: optional`.

## Example

web.dev’s own case: an element filling half the viewport moves down by a quarter of the viewport’s height, its larger side. Its old and new places cover three quarters of the viewport, and it moved a quarter, so the shift scores `0.75 × 0.25 = 0.1875`: on its own, above the good threshold of 0.1. Giving images their size keeps their space:

```html
<img src="/images/banner.webp" width="1200" height="400" alt="Eid offers on Omani sweets">
```

## Common mistakes

- Images and videos without `width` and `height`, or a CSS `aspect-ratio`.
- Ads, embeds and iframes with no space kept for them.
- Content inserted above what is already on screen, such as a banner that arrives late.
- Animating `top` or `left` rather than `transform`, which moves the layout.

## References

- [web.dev: Cumulative Layout Shift (CLS)](https://web.dev/articles/cls)
- [web.dev: Optimize Cumulative Layout Shift](https://web.dev/articles/optimize-cls)
