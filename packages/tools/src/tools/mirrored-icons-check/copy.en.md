---
summary: Does the "next" arrow point left on your Arabic page?
---

# RTL mirrored icons checker

Renders your Arabic page in Chromium, Firefox and WebKit and finds "next" and "more" arrows that point right, as icons or as characters such as «→», for your review.

## What it checks

- Icons of libraries such as Font Awesome, Bootstrap Icons and Lucide that point right or forward, such as `fa-arrow-right` and `bi-chevron-right`, in an element whose computed direction is right to left.
- Names of Material Icons and Material Symbols that point forward, such as `arrow_forward` and `chevron_right`.
- The arrows «→», «⇒», «➜» and the like in Arabic text, or alone in an inline element beside Arabic text.
- Whether a transform already mirrors the icon, such as `scaleX(-1)` on it, on its `::before` or `::after`, or on one of its three nearest ancestors, in which case it is left out.

## Example

### Wrong

```html
<p><a href="/offers">كل العروض <span aria-hidden="true">→</span></a></p>
```

### Right

```html
<p><a href="/offers">كل العروض <span aria-hidden="true">←</span></a></p>
```

## How to fix

Mirror direction icons on Arabic pages, and write the arrow that points left instead of «→»:

```html
<style>
  [dir='rtl'] .icon-arrow-right {
    transform: scaleX(-1);
  }
</style>
<a href="/offers?page=2">الصفحة التالية <i class="icon-arrow-right" aria-hidden="true"></i></a>
<a href="/offers">كل العروض <span aria-hidden="true">←</span></a>
```

- Or use the library's opposite arrow on the Arabic page, such as `fa-arrow-left` instead of `fa-arrow-right`.
- Do not mirror what does not follow the reading direction: a video's play button, a clock, or icons that draw real objects.

## FAQ

### Should I mirror every icon on an Arabic page?

No. Mirror only what follows the reading direction, such as "next", "previous" and "more" arrows: Arabic text runs from right to left, so going forward means going left. A video's play button, a clock, and icons that draw real objects stay as they are.

### Why does the result need review, and why does it never lower the score?

Because we do not know what an arrow means: a right arrow is right on an Arabic page when it means "back" or "previous". So we list what we found for you to review, and it never lowers the score.

### Why does the browser mirror `‹` and `›` but not `→`?

Because Unicode marks brackets and quotation marks, such as `‹` and `›`, as characters that mirror in right-to-left text, so the browser draws them mirrored. Arrows such as «→» and «←» do not mirror, so on an Arabic page write the arrow you mean: «←» for "next".

## Methodology

We render the page in Chromium, Firefox and WebKit with Playwright, each behind Arablyzer's egress proxy. In visible elements whose computed direction is right to left, we look for icon-library classes and Material names that point right or forward, and for arrows that do not mirror, in Arabic text or beside it, and we leave out those that a transform mirrors: on the icon, on its `::before` or `::after`, or on one of its three nearest ancestors. We report the first twenty icons, each once with the engines that found it, for your review; they never lower the score. The same page gives the same result on every check.
