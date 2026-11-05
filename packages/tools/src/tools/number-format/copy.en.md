---
summary: Does your page write the marks inside numbers one way: ٬ and ٫, or , and .?
---

# Arabic number format checker

Give the address of a page and this tool reads the numbers on it and tells you whether it writes the marks inside them two ways (٬ and ٫ beside the comma and the point), uses the Arabic comma between digits, or mixes Western and Eastern Arabic digits.

## What it checks

- Arabic decimal and thousands marks (٫ and ٬) beside Latin ones (a point and a comma) on one page.
- The Arabic comma between digits («1،500»), which is punctuation and not a thousands mark.
- Western digits (`0–9`) mixed with Eastern Arabic digits (`٠–٩`) in the same text, which the digits check also reports.
- Version numbers («6.4.2») and dates («05.03.2026») are not read as numbers with marks.

## Example

### Wrong

```html
<p>سعر المجموعة ١٬٢٥٠٫٥٠ ريال، ولدينا أكثر من ٣,٥٠٠ منتج.</p>
```

### Right

```html
<p>سعر المجموعة ١٬٢٥٠٫٥٠ ريال، ولدينا أكثر من ٣٬٥٠٠ منتج.</p>
```

## How to fix

Choose one style for the page and let the template format every number:

```html
<p>سعر المجموعة ١٬٢٥٠٫٥٠ ريال، ولدينا أكثر من ٣٬٥٠٠ منتج.</p>
```

- With Eastern Arabic digits use ٬ and ٫; with Western digits use the comma and the point. Do not combine one style’s digits with the other’s marks.
- Use `Intl.NumberFormat('ar-SA')` or the platform’s money format instead of writing marks by hand.
- Never use «،» inside a number.
- Choose between Eastern and Western digits for the whole site: the digits check says more.

## FAQ

### Should I use Eastern Arabic or Western digits?

Both are right. Western digits are what most Gulf sites use in prices and phone numbers; Eastern digits read as Arabic in running text. The problem is switching between them on one page. Pick one for the site.

### Why is «1,500» a problem?

On an Arabic page next to «١٬٢٥٠» it looks like a different kind of number. On its own, with Western digits used throughout, it is fine.

### Does it change my numbers?

No. It only reads the page and tells you what it found.

## Methodology

The check reads the page’s visible text (not scripts or code). It looks for an Arabic mark (٫ or ٬) between two digits, a Latin thousands comma (groups of three digits) or a Latin decimal point before one to three digits (not part of a longer chain such as «6.4.2»), and for the Arabic comma between two digits with no space. The digits check (`ar-digits-mixed`) is the one the page already ran.
