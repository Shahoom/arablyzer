# Page writes the marks inside numbers two ways

## Messages

### mixed

The page writes numbers with Arabic marks («{arabic}») and with Latin marks («{latin}»).

### arabic-comma

The page writes a number with the Arabic comma between its digits («{example}»), which is punctuation and not a thousands mark.

## Why it matters

- Arabic has its own decimal mark (٫) and thousands mark (٬). A page that uses them in one price and the Latin point and comma in the next shows two kinds of figure side by side.
- The Latin comma is a thousands mark in English and a decimal mark in French and German; a reader or program that sees «1,500» cannot always tell whether it is one thousand five hundred or one and a half.
- The Arabic comma (،) separates words and items in a list. «1،500» looks like two numbers, 1 and 500, to a reader and to a program.

## How to fix

Choose one style for the whole page, and let the template format every number:

```html
<p>سعر المجموعة ١٬٢٥٠٫٥٠ ريال، ولدينا أكثر من ٣٬٥٠٠ منتج.</p>
```

- With Eastern Arabic digits use ٬ and ٫; with Western digits use the comma and the point. Do not combine one style's digits with the other's marks.
- Use `Intl.NumberFormat('ar-SA')` or your platform's money format instead of writing the marks by hand.
- Never use «،» inside a number.

## How we detect

1. We read the visible text of the page, not code.
2. The `mixed` message: the page has a number with an Arabic decimal or thousands mark between digits (٬ or ٫), and a number with a Latin one: a comma between groups of three digits, or a point before one to three digits. A version number such as «6.4.2» or a date such as «05.03.2026» is not read as a number.
3. The `arabic-comma` message: the Arabic comma stands between two digits with no space.

## References

- [Unicode CLDR: number symbols by locale](https://cldr.unicode.org/)
- [MDN: Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
