---
summary: Do numbers and Latin words show in the right order?
---

# Numbers and English in Arabic text checker

Renders your page in Chromium, Firefox and WebKit and measures whether phone numbers and Latin words such as C++ show inside Arabic text in the order they were written.

## What it checks

- Phone numbers written with `+` and at least 8 digits, and numbers made of groups separated by spaces or hyphens, in Western or Arabic-Indic digits, such as `+966 50 123 4567`.
- Latin words that end in `+` or `#`, such as `C++` and `C#`.
- That the characters of each are drawn in order in every element laid out right to left: no character sits to the left of the one written before it on the same line, in any engine.

## Example

### Wrong

```html
<p>اتصل بنا على +966 50 123 4567 من الأحد إلى الخميس.</p>
<p>نطوّر أنظمة المخازن بلغة C++ منذ عشر سنوات.</p>
```

### Right

```html
<p>
  اتصل بنا على
  <a href="tel:+966501234567" dir="ltr">+966 50 123 4567</a>
  من الأحد إلى الخميس.
</p>
<p>نطوّر أنظمة المخازن بلغة <bdi>C++</bdi> منذ عشر سنوات.</p>
```

## How to fix

Isolate the number or the word from the Arabic text around it, so it is drawn left to right as written:

```html
<p>اتصل بنا على <a href="tel:+966501234567" dir="ltr">+966 50 123 4567</a></p>
<p>نطوّر أنظمة المخازن بلغة <bdi>C++</bdi></p>
```

- A number that is not a link is isolated the same way: `<span dir="ltr">`.
- Where markup is not possible, as in a page title, put the invisible left-to-right mark `U+200E` on both sides of the number.

## FAQ

### Why does a phone number show reversed inside Arabic text?

This is the browser following the Unicode Bidirectional Algorithm: the digits of each group stay left to right, but the groups, separated by spaces, follow the right-to-left direction of the paragraph, so `+966 50 123 4567` shows as `4567 123 50 966+`, and a visitor who reads the number off the screen dials the wrong one. On its own the number looks right; the problem appears once it is placed inside an Arabic sentence.

### When do I use `dir="ltr"`, and when `<bdi>`?

Use `dir="ltr"` when the text is always left to right, like a phone number. Use `<bdi>` when the direction is not known in advance, such as names or codes from a database: `<bdi>` isolates what it holds from the text around it, and takes its direction from the text itself.

### Does a number like `+500` count?

No. A short number after `+`, such as `+500` for "more than 500", reads as meant either way. We check phone numbers written with `+` and at least 8 digits, and numbers made of groups.

## Methodology

We render the page in Chromium, Firefox and WebKit with Playwright, each behind Arablyzer's egress proxy. In each element whose computed direction is right to left, we look for numbers made of groups separated by spaces or hyphens, and phone numbers written with `+` and at least 8 digits, and for Latin words that end in `+` or `#`. For each one, we measure where the engine drew each of its characters: when a character sits to the left of the one written before it, on the same line, it is out of order. Those split over two lines are not checked. We report each number or word once, as written, with the element that holds it and the engines that drew it out of order. The same page gives the same result on every check.
