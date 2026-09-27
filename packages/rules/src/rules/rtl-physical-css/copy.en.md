# CSS that sets sides by left and right

## Messages

### physical

This stylesheet sets sides by left or right rather than by start and end in {count} of its declarations; the first is shown here.

## Why it matters

- Lines on an Arabic page start at the right. `margin-left` stays on the left in either direction, while `margin-inline-start` is on the right of an Arabic page and on the left of an English one.
- Many themes are written for English pages, so when the page becomes Arabic, spacing, alignment and floated elements stay on their old side. A common case: `ul { padding-left: 0 }` does not remove a list's indent on an Arabic page, because the browser puts it at the start of the line, on the right.
- Logical properties let one stylesheet serve both directions, instead of a second one for Arabic that goes out of date.
- This rule is for information only and never lowers the score: physical properties are fine when written for this direction on purpose.

## How to fix

Use logical properties, which follow the page's direction:

| Instead of | Use |
|---|---|
| `margin-left` and `margin-right` | `margin-inline-start` and `margin-inline-end` |
| `padding-left` and `padding-right` | `padding-inline-start` and `padding-inline-end` |
| `border-left` and `border-right` | `border-inline-start` and `border-inline-end` |
| `left` and `right` | `inset-inline-start` and `inset-inline-end` |
| `text-align: left` | `text-align: start` |
| `float: left` | `float: inline-start` |

- In Tailwind CSS, use the logical classes: `ms-4` and `me-4` instead of `ml-4` and `mr-4`, `ps-4` and `pe-4` instead of `pl-4` and `pr-4`, `start-0` and `end-0` instead of `left-0` and `right-0`, and `text-start` instead of `text-left`.
- With Bootstrap, use `bootstrap.rtl.min.css` on Arabic pages.
- When a site has a stylesheet of its own for Arabic, such as one RTLCSS generates, the physical properties in it are meant. Files with `rtl` in their name are not counted.

## How we detect

1. We render the page and read the stylesheets the browser loaded, and its `<style>` elements.
2. In each, we count the declarations that set a side by left or right: `margin-left`, `padding-right`, `border-left`, `left`, `right` and the corners of `border-radius`, and the values `left` and `right` of `float`, `clear` and `text-align`.
3. We leave out rules written for one direction or language, such as `[dir="rtl"]`, `:dir(rtl)`, `.rtl` and `:lang(ar)`; blocks that set their own `direction`; opposite properties set to the same value (`left: 0; right: 0`); animations in `@keyframes`; and files with `rtl` in their name.
4. We report each stylesheet once, with its count and its first declaration. The page's `<style>` elements count as one.
5. We do not read a file whose size we could not know before reading it, or one larger than the limit.

## References

- [W3C: CSS Logical Properties and Values Level 1](https://www.w3.org/TR/css-logical-1/)
- [MDN: CSS logical properties and values](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Logical_properties_and_values)
- [W3C: Structural markup and right-to-left text in HTML](https://www.w3.org/International/questions/qa-html-dir)
