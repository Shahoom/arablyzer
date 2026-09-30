# Latin punctuation in Arabic text

## Messages

### latin-mark

Latin "{found}" right after an Arabic letter; use "{suggested}" instead.

## Why it matters

- Arabic has its own comma, semicolon and question mark: `،`, `؛` and `؟`. Each has its own Unicode character and a shape that fits Arabic letters and their direction.
- The Latin marks were designed for Latin text: the comma `,` sits low and looks out of place between Arabic letters, and the question mark `?` faces the opposite way from the `؟` Arabic readers expect.
- Mixing both kinds on one page makes the text look unedited, and it is one of the easiest mistakes to fix.

## How to fix

Replace the Latin mark with the Arabic one when it follows an Arabic word:

| Instead of | Use |
|---|---|
| `,` | `،` |
| `;` | `؛` |
| `?` | `؟` |

- Do not replace them blindly everywhere: the comma inside numbers such as `1,500`, between English words such as `React, Vue`, and in code and links stays as it is.
- Most Arabic keyboard layouts include the Arabic marks, so it is easiest to type them from the start rather than fix them later.

## How we detect

1. The rule applies to pages where more than half of the letters of the visible text are Arabic-script.
2. We look in the visible text for an Arabic letter, optionally followed by diacritics or tatweel, immediately followed by `,`, `;` or `?`. We follow the text across inline tags, so `<b>كلمة</b>,` counts too.
3. We skip code (`code`, `pre`, `kbd`, `samp`) and words that contain `/`, which are links or paths. Digits and Latin letters before the mark do not count.
4. Each mark is its own finding, with its line and the text around it.

## References

- [Unicode: Arabic block code chart (U+0600)](https://www.unicode.org/charts/PDF/U0600.pdf)
- [W3C: Arabic & Persian Layout Requirements](https://www.w3.org/TR/alreq/)
