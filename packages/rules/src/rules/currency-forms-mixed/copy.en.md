# Page writes a currency in two forms

## Messages

### mixed

The page writes {currency} in more than one form next to numbers: {forms} (for example «{first}» and «{second}»).

## Why it matters

- A shopper who sees «120 ر.س» on one product and «75 SAR» on the next is, for a moment, unsure that both are the same money. A store that writes its prices one way looks finished and careful.
- Prices written in one form are easier to read in the search result, to copy into a message, and for a program to take from the page.
- The forms differ in more than looks: «ر.س» and «SAR» run in opposite directions inside Arabic text, and «SAR» next to an Arabic number can come out in the wrong order.

## How to fix

Choose one form for each currency and use it in every price:

```html
<p>عطر العود الملكي بسعر 120 ر.س، وعبوة المسك الأبيض بسعر 75 ر.س فقط.</p>
```

- For an Arabic page, the Arabic abbreviation (ر.س، د.إ، ر.ع، د.ك، د.ب، ر.ق) is the natural choice; for an English page, the ISO code (`SAR`, `AED`, `OMR`, `KWD`, `BHD`, `QAR`).
- Set it once, in the theme's money format or in the platform's currency display setting, and every price follows.
- Keep the ISO code in the structured data (`priceCurrency`): it is a code for programs, not text for shoppers.
- Put a number and its currency in one `<bdi>` or `dir="ltr"` span, so they stay together in right-to-left text.

## How we detect

1. We read the visible text of the page, not code, and look for a number with a currency form on either side of it (a space between is fine). The forms for each currency (Saudi riyal, Emirati dirham, Omani riyal, Kuwaiti dinar, Bahraini dinar, Qatari riyal, Egyptian pound) are listed in the method below.
2. A word that is more than one country's, such as «ريال» alone, is not a form of any currency.
3. A currency with two or more forms on the page is one finding, with the forms and an example of two.

The forms we know: the Arabic abbreviation (ر.س), the ISO code (SAR), the short Latin form (SR), the Arabic name with its country («ريال سعودي»), and for the Saudi riyal the sign ﷼ and the new sign ⃁. A page that mixes the sign with the abbreviation is flagged as well.

## References

- [Unicode Consortium: the Saudi Riyal sign (U+20C1)](https://www.unicode.org/charts/PDF/U20A0.pdf)
- [Unicode CLDR: Arabic currency formats](https://cldr.unicode.org/)
