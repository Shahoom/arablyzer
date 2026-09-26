# Numbers and Latin words out of order in right-to-left text

## Messages

### number

A number in this right-to-left text is drawn out of order, so it no longer reads as written.

### latin

A Latin word in this right-to-left text is drawn out of order, so it no longer reads as written.

## Why it matters

- **Phone numbers are the usual victim.** Inside Arabic text, `+966 50 123 4567` can appear as `4567 123 50 966+`, so a visitor who reads the number off the screen dials the wrong one.
- **This is the browser following the Unicode Bidirectional Algorithm:** the digits of each group stay left to right, but the groups, separated by spaces, follow the right-to-left direction of the paragraph. Names such as `C++` and `C#` lose their symbols to the other side of the word in the same way.
- **The page looks right to its author only when the number sits on its own:** the problem appears once the number is placed inside an Arabic sentence.

## How to fix

Mark the number or the word as left to right:

```html
<p>اتصل بنا على <a href="tel:+966501234567" dir="ltr">+966 50 123 4567</a></p>
<p>نطوّر أنظمة المخازن بلغة <bdi>C++</bdi></p>
```

- Use `dir="ltr"` when the text is always left to right, like a phone number.
- Use `<bdi>` when the direction is not known in advance, such as names or codes from a database.
- Where markup is not possible, as in a page title, put the invisible left-to-right mark `U+200E` on both sides of the number.

## How we detect

1. We render the page in a browser. In each element laid out right to left, we look for numbers made of groups separated by spaces or hyphens, or that start with `+`, in Western or Arabic-Indic digits, and for Latin words that end in `+` or `#`.
2. For each one, we measure where the browser drew each of its characters. When a character sits to the left of the one written before it, on the same line, the number or word is out of order. Those split over two lines are not checked.
3. The finding shows the number or the word as written, and the element that holds it.

## References

- [Unicode: UAX #9, the Unicode Bidirectional Algorithm](https://www.unicode.org/reports/tr9/)
- [W3C: Inline markup and bidirectional text in HTML](https://www.w3.org/International/articles/inline-bidi-markup/)
- [HTML Standard: the bdi element](https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-bdi-element)
