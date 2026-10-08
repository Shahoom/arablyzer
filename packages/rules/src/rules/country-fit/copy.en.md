# Country fit

## Messages

### fit-sa

This page looks written for Saudi Arabia ({evidence}), and is ready {percent}% for it: {ok} of the {judged} items we could judge fit, and {gaps} do not.

### fit-ae

This page looks written for the UAE ({evidence}), and is ready {percent}% for it: {ok} of the {judged} items we could judge fit, and {gaps} do not.

### fit-eg

This page looks written for Egypt ({evidence}), and is ready {percent}% for it: {ok} of the {judged} items we could judge fit, and {gaps} do not.

### fit-kw

This page looks written for Kuwait ({evidence}), and is ready {percent}% for it: {ok} of the {judged} items we could judge fit, and {gaps} do not.

### fit-qa

This page looks written for Qatar ({evidence}), and is ready {percent}% for it: {ok} of the {judged} items we could judge fit, and {gaps} do not.

### fit-bh

This page looks written for Bahrain ({evidence}), and is ready {percent}% for it: {ok} of the {judged} items we could judge fit, and {gaps} do not.

### fit-om

This page looks written for Oman ({evidence}), and is ready {percent}% for it: {ok} of the {judged} items we could judge fit, and {gaps} do not.

### fit-jo

This page looks written for Jordan ({evidence}), and is ready {percent}% for it: {ok} of the {judged} items we could judge fit, and {gaps} do not.

### fit-ma

This page looks written for Morocco ({evidence}), and is ready {percent}% for it: {ok} of the {judged} items we could judge fit, and {gaps} do not.

### gap-currency

The prices here are not in {currency}, the money of the country this page is for (it shows: {seen}).

### gap-phone-local

The number «{seen}» has no country code, so it cannot be dialed from abroad or opened in WhatsApp: write it as +{dial} followed by the number without its leading 0.

### gap-phone-foreign

The number «{seen}» has another country's calling code, not +{dial}, the code of the country this page is for.

### gap-digits

Arabic-Indic digits appear {seen} times; readers in this country read Latin digits (0 to 9) on the web.

### gap-vat

The page shows prices but never says whether they include value-added tax, which this country charges: say «including VAT» or «excluding VAT» beside them.

### gap-hijri

The page shows Gregorian dates and no Hijri date, which readers here expect beside them on dated content.

### gap-lang

The page's language tag is «{seen}», the region of another country than the one this page is for.

### gap-dialect

The page's text leans to a dialect other than the one of the country this page is for ({seen}).

## Why it matters

- A visitor decides in seconds whether a site is for them. Prices in the wrong currency, a phone number nobody can dial, digits the country does not use and a missing tax statement each say «not for you», and none of it shows in a speed or SEO score.
- Gulf shoppers expect the price in their own currency and to know whether VAT is in it; Saudi pages are expected to carry a Hijri date beside the Gregorian on dated content; Moroccan readers expect Latin digits.
- Search engines and WhatsApp read these details too: a number without a country code is not a link a phone can open from abroad.

## How to fix

- **Currency:** show the country's own currency, with its code or sign: SAR (the new sign ⃁, U+20C1), AED, EGP, KWD, QAR, BHD, OMR, JOD, MAD.
- **Phone:** write numbers with the country code: +966 5x xxx xxxx, and put the same number in `tel:` and WhatsApp links.
- **Digits:** in Morocco, write Latin digits; in the Gulf and Egypt, choose one script for each number and keep it.
- **VAT:** where it is charged (Saudi Arabia, the UAE, Bahrain, Oman), say whether prices include it, and show the tax registration number.
- **Hijri:** for Saudi pages with dates, add the Hijri date beside the Gregorian.
- **Language tag:** `lang="ar-SA"` for a page for Saudi Arabia, or plain `lang="ar"` if it is for all Arabic readers.

```html
<html lang="ar-SA" dir="rtl">
  <p>150 SAR, VAT included · Tel: +966 50 123 4567</p>
</html>
```

## How we detect

1. We read the page's visible text, its `tel:` links, its address's country domain, the region of its language tag and its hreflang links.
2. We name a country only when two kinds of evidence agree (a ccTLD, a language region, a currency that belongs to one country, a calling code) and no other country's evidence comes within two points of it. Otherwise the page says too little, or too much, and we say nothing: we do not guess.
3. For that country we judge each item the page gives something to judge: prices and their currency, phone numbers, digits, a tax statement where the country charges VAT, a Hijri date where the page has dates, the language tag's region. An item the page shows nothing for is not counted.
4. The percentage is the items that fit over those judged, and only with three or more judged. A page that fits every item has no finding; the report's facts keep its 100%.
5. This is information, never deducted.

## References

- [ZATCA: VAT in Saudi Arabia](https://zatca.gov.sa/en/RulesRegulations/Taxes/Pages/VAT.aspx)
- [Unicode 17.0: the Saudi Riyal sign, U+20C1](https://www.unicode.org/versions/Unicode17.0.0/)
- [ITU: E.164 calling codes](https://www.itu.int/rec/T-REC-E.164)
