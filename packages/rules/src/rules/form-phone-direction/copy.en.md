# Phone field shown right to left

## Messages

### reversed

This phone field is shown right to left, so a number typed as «+968 9123 4567» shows as «4567 9123 968+».

## Why it matters

- In a right-to-left field, the groups of a phone number are laid out from right to left: the country code moves to the end, and the groups swap places. People think they typed it wrong, and change a number that was right.
- Chromium, Firefox and WebKit, Safari's engine, show `type="tel"` fields left to right on right-to-left pages, but phone fields written as `type="text"`, even with `inputmode="tel"`, take the page's direction.

## How to fix

- Use `type="tel"` for phone fields, which also opens the phone keypad, and add `dir="ltr"` so every browser shows the number left to right: `<input type="tel" dir="ltr" autocomplete="tel">`.
- To keep the field aligned with the right-to-left page, add `text-align: right` to it in CSS.
- `dir="auto"` works too: the field takes its direction from what is typed.

## How we detect

1. We render the page and read the computed direction of each text field, in each engine.
2. A phone field is one with `type="tel"`, `inputmode="tel"` or an `autocomplete` for a phone number, or whose name, id, label or placeholder names a phone («هاتف»، «جوال»، «واتساب», phone, mobile…).
3. It fails when it is shown right to left without `dir="auto"` or `unicode-bidi: plaintext`. Number fields (`type="number"`) are left out: they hold digits alone, which keep their order.

## References

- [W3C: Inline markup and bidirectional text in HTML](https://www.w3.org/International/articles/inline-bidi-markup/)
- [HTML Standard: The dir attribute](https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute)
- [MDN: input type="tel"](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/tel)
