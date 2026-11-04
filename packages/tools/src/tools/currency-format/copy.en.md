---
summary: Does your page write its currency in one form: ر.س or SAR, not both?
---

# Currency format checker

Give the address of a page and this tool reads the prices on it and tells you whether any currency is written in more than one form: «ر.س» and «SAR», «د.ك» and «KD», «درهم إماراتي» and «AED». It knows the Saudi riyal, the Emirati dirham, the Omani riyal, the Kuwaiti dinar, the Bahraini dinar, the Qatari riyal and the Egyptian pound.

## What it checks

- A number with a currency form next to it, in the visible text of the page and not in code.
- Each currency’s forms: its Arabic abbreviation, its ISO code, its short Latin form, its Arabic name with the country, and for the Saudi riyal the signs ﷼ and ⃁.
- A word more than one country uses, such as «ريال» alone, is not counted as a form of any currency.
- A currency written in two or more forms is one finding, with the forms and an example of two.

## Example

### Wrong

```html
<p>عطر العود الملكي بسعر 120 ر.س، وعبوة المسك الأبيض بسعر 75 SAR فقط.</p>
```

### Right

```html
<p>عطر العود الملكي بسعر 120 ر.س، وعبوة المسك الأبيض بسعر 75 ر.س فقط.</p>
```

## How to fix

Choose one form for each currency, set it once in the theme or the platform’s money format, and keep a price’s number and currency together:

```html
<p>عطر العود الملكي بسعر <bdi>120 ر.س</bdi>، وعبوة المسك الأبيض بسعر <bdi>75 ر.س</bdi> فقط.</p>
```

- For an Arabic page, the Arabic abbreviation (ر.س، د.إ، ر.ع، د.ك، د.ب، ر.ق); for an English page, the ISO code.
- Set the form in the theme’s money format or the platform’s currency display setting, so every price follows.
- Keep the ISO code in structured data (`priceCurrency`): it is for programs.
- Put the number and its currency in one `<bdi>` span, so they stay together in right-to-left text.

## FAQ

### Is writing «SAR» wrong?

No. «SAR» and «ر.س» are both right. The problem is the page using both for the same money. Pick the one that suits your readers.

### Which form do Gulf shoppers prefer?

It differs by country and by shop. What matters is that one page reads the same way throughout. We do not rank the forms.

### Does it check the amounts?

No: only how the currency is written. A price with the wrong number of decimals (three for the Omani riyal, the Kuwaiti and the Bahraini dinar) is the price format checker’s.

## Methodology

The check reads the page’s visible text (not scripts or code) and looks for a number with a currency form on either side, a space between them allowed. The forms for each currency are in Arablyzer’s list; a form must not touch another letter, so «SARAH» is not «SAR». A currency with two or more forms in the page is one finding.
