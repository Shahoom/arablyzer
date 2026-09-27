# Prices in Omani rials or Kuwaiti or Bahraini dinars without three decimals

## Messages

### one-decimal

The price «{price}» is written with one decimal place; ISO 4217 gives this currency three: «{fixed}».

### two-decimals

The price «{price}» is written with two decimal places; ISO 4217 gives this currency three: «{fixed}».

## Why it matters

- ISO 4217, the international standard for currencies, gives the Omani rial, the Kuwaiti dinar and the Bahraini dinar three decimal places: a rial is 1,000 baisa, and a dinar 1,000 fils. Formatting that follows the currency, such as `Intl.NumberFormat` in browsers, writes prices in them with three decimals: «KWD 3.750».
- A price with one or two decimals, such as «12.50 ر.ع.», is written in the format of two-decimal currencies such as the US dollar or the Saudi riyal.
- A shop whose price format has two decimals shows every price that way, and rounds a price with a third decimal to fit: 1.245 is shown as 1.25.

## How to fix

- Show prices in these currencies with three decimals: «12.500 ر.ع.»، «KD 3.750»، «BD 1.500».
- In your shop platform's currency settings, set the number of decimals for these currencies to three, and check that prices with a third decimal are not rounded on the way to the page.
- In code, format with the currency's own decimals rather than a fixed two: `new Intl.NumberFormat('ar-OM', { style: 'currency', currency: 'OMR' }).format(12.5)` gives «١٢٫٥٠٠ ر.ع.».

## How we detect

1. We read the visible text of the page's HTML, outside code tags, and join text that only inline elements such as `<span>` split, so a number and its currency in separate elements are read together.
2. A price is a number next to a currency marker, before or after it, with only spaces between them: the ISO code (OMR, KWD, BHD), the Latin abbreviation (RO, KD, BD, with or without dots), the Arabic abbreviation (ر.ع.، د.ك.، د.ب.) or the currency's Arabic name (ريال عماني، دينار كويتي، دينار بحريني). «ريال» or «دينار» alone does not count: it could be another country's currency.
3. We read Western and Arabic-Indic digits, with `.` or `٫` as the decimal mark and `,` or `٬` between thousands. A price fails with one or two digits after the decimal mark; whole prices such as «15 ر.ع.» pass, and so do numbers whose separators do not show which one is the decimal mark, such as «12,50». Amounts in thousands, millions or billions, such as «KD 12.5 million» or «د.ك 2.5 مليون», are not prices and do not count.
4. We report the first such price in each currency, with the number of such prices on the page.

## References

- [SIX: ISO 4217 currency code lists, from the maintenance agency](https://www.six-group.com/en/products-services/financial-information/data-standards.html)
- [MDN: Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
