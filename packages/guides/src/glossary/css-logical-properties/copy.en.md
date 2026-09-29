# CSS logical properties

CSS logical properties set sides by the flow of the text, start and end, instead of left and right, so one stylesheet serves Arabic and English pages alike.

## Definition

- Logical properties and values, from the W3C's CSS Logical Properties module, name sides and sizes by the flow of text, not the screen: the inline axis runs along a line, the block axis across lines, and each has a start and an end.
- On a horizontal page, `inline-start` is where lines start: left in English, right in Arabic. So `margin-inline-start` is the left margin of an English page and the right margin of an Arabic one.
- Physical properties have logical counterparts, such as `padding-inline-end` for `padding-right` in English, `inset-inline-start` for `left` and `inline-size` for `width`, and there are logical values: `text-align: start`, `float: inline-start` and `clear: inline-end`.

## Why it matters

- A theme written with `margin-left` and `float: left` keeps those sides when the page turns right to left, so spacing, alignment and floated elements stay where the English design put them.
- A common case: `ul { padding-left: 0 }` does not remove a list's indent on an Arabic page, because the browser puts the indent at the start of the line, on the right.
- With logical properties, one stylesheet serves both directions, instead of a second one for Arabic that goes out of date.

## Example

One rule instead of two:

```css
/* Before */
.card { margin-left: 1rem; text-align: left; }
[dir="rtl"] .card { margin-left: 0; margin-right: 1rem; text-align: right; }

/* After */
.card { margin-inline-start: 1rem; text-align: start; }
```

## Common mistakes

- Converting margins and paddings only: `text-align`, `float`, the positions `left` and `right`, and the corners of `border-radius` have logical forms too.
- Four-value shorthands are physical: `padding: 0 1rem 0 0` sets the top, right, bottom and left. For start and end, use `padding-inline: 0 1rem`.
- In Tailwind CSS, writing `ml-4`, `pl-4` and `text-left` instead of the logical classes `ms-4`, `ps-4` and `text-start`.

## References

- [W3C: CSS Logical Properties and Values Level 1](https://www.w3.org/TR/css-logical-1/)
- [MDN: CSS logical properties and values](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Logical_properties_and_values)
- [MDN: padding-inline](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/padding-inline)
