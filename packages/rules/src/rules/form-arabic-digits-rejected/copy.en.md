# Number field rejects Arabic-Indic digits

## Messages

### rejected

This field accepts «{western}» but rejects the same number in Arabic-Indic digits, «{eastern}»: its pattern is `{pattern}`.

## Why it matters

- Arabic keyboards, especially on phones, can type Arabic-Indic digits (`١٢٣`), and numbers copied from Arabic text carry them. In a pattern, `\d` and `[0-9]` match the Western digits 0–9 only, so a phone number or a code typed that way is refused: the browser stops the form, and its message only asks to match the requested format.
- These fields sit in checkout and sign-in forms: a phone number for delivery, a verification code, a card's security code.

## How to fix

- Accept the digit sets people type in the pattern: `[0-9٠-٩۰-۹]{8}` for Western, Arabic-Indic and Persian digits, or `\p{Nd}{8}` for the decimal digits of any script; browsers read patterns with the `v` flag, which understands `\p{…}`.
- Then convert the digits to Western ones before you check or store the number, in JavaScript or on the server:

```js
const DIGITS = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'
const western = value.replace(/[٠-٩۰-۹]/g, (digit) => String(DIGITS.indexOf(digit) % 10))
```

- Or drop the pattern, keep `inputmode="numeric"` for the keyboard, and check the number after converting its digits.

## How we detect

1. We find inputs for numbers that have a `pattern`: `type="tel"`, `inputmode` `numeric` or `decimal`, an `autocomplete` for a phone number, postal code, one-time code or card, or a pattern made of digits only. `type="number"` is left out: the pattern attribute does not apply to it.
2. We try Western-digit numbers against the pattern as browsers do, with the `v` flag: the placeholder's example first (such as «9xxxxxxx»), then numbers of common lengths, alone, after «+», and after the digits the pattern spells out (such as «05»).
3. A field fails when it accepts one of these numbers but none of them written in Arabic-Indic digits. When it accepts none of them there is nothing to compare, and it does not fail. Patterns that do not compile are ignored, as browsers ignore them, and so are patterns that take too long to run.
4. We check Arabic pages only: those whose `<html lang>` is Arabic or whose text is mostly Arabic.

## References

- [HTML Standard: The pattern attribute](https://html.spec.whatwg.org/multipage/input.html#the-pattern-attribute)
- [MDN: HTML attribute: inputmode](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode)
- [MDN: Character class escape: \d, \D, \w, \W, \s, \S](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Character_class_escape)
- [Unicode: Arabic code chart](https://www.unicode.org/charts/PDF/U0600.pdf)
