# Eastern Arabic numerals

Eastern Arabic numerals are the digit shapes used with Arabic in eastern Arabic-speaking countries, called Arabic-Indic digits in Unicode, beside the Western digits.

## Definition

- Eastern Arabic numerals are the digits `٠١٢٣٤٥٦٧٨٩`, which Unicode names Arabic-Indic digits (`U+0660` to `U+0669`). The W3C's Arabic Layout Requirements list them for eastern Arabic-speaking countries such as Egypt, Saudi Arabia and Iraq, and the European digits `0123456789` for western ones such as Algeria and Morocco.
- The name is ambiguous: it also covers the Persian and Urdu forms `۰۱۲۳۴۵۶۷۸۹`, Unicode's Extended or Eastern Arabic-Indic digits (`U+06F0` to `U+06F9`), whose four, five and six differ in shape. The W3C avoids it for that reason; here, as in Arablyzer's rules, it means `٠` to `٩`.
- In every system, the highest digit is on the left, even in right-to-left text. Arabic-Indic digits have their own separators, `٫` and `٬`, as in `١٬٢٣٤٫٥`.

## Why it matters

- Mixing systems on one page, `15` here and `١٥` there, looks careless, and search treats them as different text.
- In a form's pattern, `\d` and `[0-9]` match Western digits only, so a phone number typed in Arabic-Indic digits can be refused.
- The Unicode Bidirectional Algorithm gives Arabic-Indic digits their own type (AN) and European and Persian digits another (EN), so a sentence can order differently with each.

## Example

Name the digit system when you format a number:

```js
new Intl.NumberFormat('ar-u-nu-arab').format(1500.5) // '١٬٥٠٠٫٥'
new Intl.NumberFormat('ar-u-nu-latn').format(1500.5) // '1,500.5'
```

`nu` sets the numbering system: `arab` for Arabic-Indic, `arabext` for Persian and `latn` for Western digits. Without it, the default depends on the locale.

## Common mistakes

- Letting each source choose its digits: prices from the database in one system, dates from a plugin in another.
- Persian digits in Arabic text: `۴`, `۵` and `۶` differ from `٤`, `٥` and `٦`, and usually come from a Persian keyboard or source.
- Validating with `\d` or `[0-9]` alone: accept the digits people type, and convert them before checking.

## References

- [W3C: Arabic & Persian Layout Requirements, families of numerals](https://www.w3.org/TR/alreq/#h_families_of_numerals)
- [Unicode: the Arabic code chart, digits at `U+0660` and `U+06F0`](https://www.unicode.org/charts/PDF/U0600.pdf)
- [MDN: Intl.NumberFormat() constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat)
