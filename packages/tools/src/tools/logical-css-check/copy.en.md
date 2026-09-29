---
summary: Does your page's CSS use margin-left instead of margin-inline-start?
---

# CSS logical properties checker

Renders your Arabic page and counts the CSS declarations that fix sides to left and right, such as margin-left, rather than logical ones that follow the page's direction.

## What it checks

- The stylesheets the browser loaded for a page laid out right to left, and its `<style>` elements.
- Declarations that set a side by left or right: `margin-left`, `padding-right`, `border-left`, `left`, `right` and the corners of `border-radius`.
- The values `left` and `right` of `float`, `clear` and `text-align`.
- What is written for one direction on purpose is not counted: rules for `[dir="rtl"]`, `:dir(rtl)`, `.rtl` and `:lang(ar)`, and files with `rtl` in their name.

## Example

### Wrong

```html
ul.menu {
  padding-left: 0;
  list-style: none;
}
.menu li {
  float: left;
  margin-right: 16px;
}
```

### Right

```html
ul.menu {
  padding-inline-start: 0;
  list-style: none;
}
.menu li {
  float: inline-start;
  margin-inline-end: 16px;
}
```

## How to fix

Use logical properties, which follow the page's direction: `margin-inline-start` puts the margin on the right of an Arabic page and on the left of an English one.

```html
<style>
  .card {
    margin-inline-start: 16px;
    padding-inline-end: 8px;
    border-inline-start: 4px solid;
    text-align: start;
  }
</style>
```

| Instead of | Use |
|---|---|
| `margin-left` and `margin-right` | `margin-inline-start` and `margin-inline-end` |
| `padding-left` and `padding-right` | `padding-inline-start` and `padding-inline-end` |
| `border-left` and `border-right` | `border-inline-start` and `border-inline-end` |
| `left` and `right` | `inset-inline-start` and `inset-inline-end` |
| `border-top-left-radius` | `border-start-start-radius` |
| `text-align: left` and `text-align: right` | `text-align: start` and `text-align: end` |
| `float: left` and `float: right` | `float: inline-start` and `float: inline-end` |

- In Tailwind CSS, use the logical classes: `ms-4` and `me-4` instead of `ml-4` and `mr-4`, `ps-4` and `pe-4` instead of `pl-4` and `pr-4`, `start-0` and `end-0` instead of `left-0` and `right-0`, and `text-start` instead of `text-left`.
- With Bootstrap, use `bootstrap.rtl.min.css` on Arabic pages.

## FAQ

### Do I have to rewrite all my CSS with logical properties?

No. This tool is for information only and never lowers the score: physical properties are fine when written for this direction on purpose. Logical properties let one stylesheet serve both directions, instead of a second one for Arabic that goes out of date.

### Why does `padding-left: 0` not remove a list's indent on an Arabic page?

Because the browser puts the list's indent at the start of the line, and on an Arabic page the line starts at the right. `padding-left` removes an indent that is not there, and the one on the right stays. Use `padding-inline-start: 0`.

### What if my site has a stylesheet of its own for Arabic?

Then the physical properties in it are meant, as in one RTLCSS generates or `bootstrap.rtl.min.css`. Files with `rtl` in their name are not counted, nor are rules written for one direction or language, such as `[dir="rtl"]` and `:lang(ar)`, or blocks that set their own `direction`.

## Methodology

We render the page in Chromium, Firefox and WebKit with Playwright, each behind Arablyzer's egress proxy. When the page is laid out right to left, we read the stylesheets the browser loaded and its `<style>` elements, and count in each the declarations that set a side by left or right. We leave out rules written for one direction or language, blocks that set their own `direction`, opposite properties set to the same value (`left: 0; right: 0`), animations in `@keyframes`, and files with `rtl` in their name. We report each stylesheet once, with its count and its first declaration; the page's `<style>` elements count as one. We do not read a file whose size we could not know before reading it, or one larger than the limit; Firefox and WebKit hide the size of another site's stylesheet, so there it is not read. The result is information and never lowers the score; the same page gives the same result on every check.
