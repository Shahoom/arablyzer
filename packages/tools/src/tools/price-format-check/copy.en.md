---
summary: Do your prices in Omani rials and Kuwaiti or Bahraini dinars have three decimals?
---

# Price format checker

Checks that prices in Omani rials and Kuwaiti or Bahraini dinars on your page have the three decimals ISO 4217 gives them, such as OMR 12.500 or KD 3.750.

## What it checks

- Prices in the page's visible text: numbers with an Omani rial, Kuwaiti dinar or Bahraini dinar marker before or after them.
- The currency marker as its ISO 4217 code (`OMR`, `KWD`, `BHD`), its Latin abbreviation (`RO`, `KD`, `BD`), its Arabic abbreviation (ر.ع.، د.ك.، د.ب.) or its Arabic name, such as «ريال عماني».
- Three digits after the decimal mark, not one or two, in Western or Eastern Arabic digits, such as `3.500` or `٣٫٥٠٠`.

## Example

### Wrong

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <body>
    <h1>عطر العود الملكي</h1>
    <p>السعر: 12.50 ر.ع.</p>
    <p>الشحن إلى الكويت: 1.5 د.ك.</p>
  </body>
</html>
```

### Right

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <body>
    <h1>عطر العود الملكي</h1>
    <p>السعر: 12.500 ر.ع.</p>
    <p>الشحن إلى الكويت: 1.500 د.ك.</p>
  </body>
</html>
```

## How to fix

Write prices in these currencies with three decimals, even when the third is a zero:

```html
<p>عطر العود الملكي: 12.500 ر.ع.</p>
<p>الشحن إلى الكويت 1.500 د.ك.، وإلى البحرين BD 1.250</p>
```

- In your shop platform's currency settings, set the number of decimals for these currencies to three, and check that prices with a third decimal are not rounded on the way to the page: 1.245 must not become 1.25.
- In code, format with the currency's own decimals rather than a fixed two: `new Intl.NumberFormat('ar-OM', { style: 'currency', currency: 'OMR' }).format(12.5)` gives the price with three decimals.
- The Saudi riyal, the UAE dirham and the Qatari riyal have two decimals, so their prices stay as they are.

## FAQ

### Why three decimals?

Because ISO 4217, the international standard for currencies, gives the Omani rial and the Kuwaiti and Bahraini dinars three decimal places: a rial is 1,000 baisa, and a dinar 1,000 fils. Formatting that follows the currency, such as `Intl.NumberFormat` in browsers, writes prices in them with three decimals: «KWD 3.750».

### Do Saudi riyal prices need three decimals too?

No. The Saudi riyal, the UAE dirham and the Qatari riyal have two decimals in ISO 4217, so the tool does not check them. Nor does it count «ريال» or «دينار» alone: it could be another country's currency.

### Does a price without decimals fail?

No. «15 ر.ع.» is a correct price: the tool reports only prices with one or two digits after the decimal mark. It does not judge numbers whose separators do not show which one is the decimal mark, such as «12,50», nor amounts in thousands or millions, such as «KD 12.5 million», which are not prices.

## Methodology

We fetch the page as `ArablyzerBot`, following its redirects, and read the visible text of the HTML as the server sends it, before any JavaScript runs, outside code tags. We join text that only inline elements such as `<span>` split, so a number and its currency in separate elements are read together. A price is a number with a currency marker before or after it, with only spaces between them. We read Western and Eastern Arabic digits, with `.` or `٫` as the decimal mark and `,` or `٬` between thousands, and report the first failing price in each currency, with the number of failing prices on the page. The same page gives the same result on every check.
