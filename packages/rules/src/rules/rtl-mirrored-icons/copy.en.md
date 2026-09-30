# Direction icons not mirrored in Arabic text

## Messages

### icon

The icon `{name}` points right in text read from right to left, and is not mirrored. If it means "next" or "more", it should point left.

### arrow

The arrow «{name}» points right in Arabic text. If it means "next" or "more", it should point left: «←».

## Why it matters

- Arabic text runs from right to left, so going forward means going left: "next" points left, and "previous" points right.
- Icon libraries draw their arrows for English pages, and the browser does not mirror them by itself. The arrows «→» and «←» are not mirrored either, unlike brackets and quotation marks such as `‹` and `›`, which the browser mirrors in Arabic text.
- An arrow on the wrong side confuses visitors in carousels, numbered pages and "more" links.

## How to fix

- Mirror direction icons on Arabic pages:

```css
[dir='rtl'] .icon-arrow-right {
  transform: scaleX(-1);
}
```

- Or use the opposite arrow icon on the Arabic page, or write «←» instead of «→».
- Do not mirror what does not follow the reading direction: a video's play button, a clock, or icons that draw real objects.
- We do not know what an arrow means, and a right arrow is right when it means "back". So this rule needs a person's review, and never lowers the score.

## How we detect

1. We render the page and look, in elements whose computed direction is right to left, for icons that point right or forward: classes of Font Awesome, Bootstrap Icons, Lucide and similar libraries, such as `fa-arrow-right` and `bi-chevron-right`, and names of Material Icons and Material Symbols, such as `arrow_forward` and `chevron_right`.
2. We also look for the arrows «→», «⇒», «➜» and the like in Arabic text, or alone in an inline element beside Arabic text.
3. We leave an icon out when a transform on it, on its `::before` or `::after`, or on one of its three nearest ancestors, mirrors it horizontally, such as `scaleX(-1)`.
4. We report the first twenty icons, for review.

## References

- [Material Design: Bidirectionality](https://m2.material.io/design/usability/bidirectionality.html)
- [W3C: Structural markup and right-to-left text in HTML](https://www.w3.org/International/questions/qa-html-dir)
- [Unicode: The Bidirectional Algorithm, mirroring](https://www.unicode.org/reports/tr9/#Mirroring)
