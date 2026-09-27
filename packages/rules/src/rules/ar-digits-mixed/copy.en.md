# Mixed digit systems in Arabic text

## Messages

### mixed

The page writes numbers in two different systems: Western digits such as «{western}», and Eastern Arabic digits such as «{eastern}».

### persian

The page has Persian digits such as «{persian}» in Arabic text, and their 4, 5 and 6 differ in shape from the Arabic ones.

## Why it matters

- **Readers** notice numbers changing shape from one paragraph to the next, so the page looks careless, especially in prices, sizes and dates.
- **Search**, on the page and in search engines, treats «١٥» and «15» as different text, so someone looking for a price or an order number in one system may not find it in the other.
- **Persian digits** (۴ ۵ ۶) differ in shape from Eastern Arabic ones (٤ ٥ ٦); they usually show up when text is typed on a Persian keyboard or copied from a Persian source.

## How to fix

- Choose one digit system for the whole site, Western (0-9) or Eastern Arabic (٠-٩), and keep to it in text, prices and tables.
- If some numbers come from the database or a plugin, format them the same way in the template, such as `toLocaleString('ar-SA')` or `toLocaleString('ar-SA-u-nu-latn')` in JavaScript, depending on the system you chose.
- Replace Persian digits with Arabic ones: ۴ → ٤, ۵ → ٥, ۶ → ٦, or with Western ones.

## How we detect

1. We read the visible text in the page's HTML as the server sends it, on pages where most letters are Arabic, leaving out code tags such as `<code>`.
2. We collect the numbers that stand on their own, with their separators and decimal marks, such as «٤٫٥» and «1,500».
3. We leave out numbers next to Latin words, such as «iPhone 15» and «Windows 11», and international phone numbers that start with `+`, since those are usually written in Western digits.
4. The rule fails when the page has both Western and Eastern Arabic digits, and points at the first number of the system used less. It also fails when there are Persian digits.

## References

- [W3C: Arabic and Persian Layout Requirements, digits](https://www.w3.org/TR/alreq/#h_digits)
- [Unicode: the Arabic code chart, digits at U+0660 and U+06F0](https://www.unicode.org/charts/PDF/U0600.pdf)
