---
summary: Is your page ready for Saudi Arabia, the UAE or Egypt? Currency, phone, digits, VAT, Hijri date.
---

# Country fit for Arab sites

Reads the page, works out which Arab country it is written for, and tells you how ready it is for that country: its currency, phone numbers with country codes, digits, VAT, Hijri dates, and the new Saudi Riyal sign in its fonts.

## What it checks

- Which country the page is for, from its country domain, the region of its language tag, a currency that belongs to one country, and calling codes. It names one only when two kinds of evidence agree and no other country's comes close; otherwise it says the evidence is thin, and gives no percentage.
- For that country: prices in its own currency, phone numbers with its country code, Latin digits in Morocco, a VAT statement where prices are shown (Saudi Arabia, the UAE), a Hijri date beside Gregorian dates (Saudi Arabia), the language tag's region.
- Whether the page's web fonts have a glyph for the new Saudi Riyal sign (`⃁`, U+20C1), or the sign shows as an empty box on devices that lack it.
- The result is «ready X% for the country», information, never deducted.

## Example

### Wrong

```html
<p>السعر: 150 USD</p>
<p>للطلب اتصل على 0501234567 أو على +966 50 123 4567</p>
<p>تاريخ النشر: 15/03/2026</p>
```

### Right

```html
<p>السعر: 150 ر.س شامل ضريبة القيمة المضافة</p>
<p>للطلب اتصل على +966 50 123 4567</p>
<p>تاريخ النشر: 15/03/2026 الموافق 26 رمضان 1447 هـ</p>
```

## How to fix

- Show prices in the country's own currency (SAR, AED, EGP, KWD, QAR, BHD, OMR, JOD, MAD), with its code or sign.
- Write phone numbers with the country code, `+966 50 123 4567`, in the text and in `tel:` and WhatsApp links.
- Say whether prices include VAT, where the country charges it, and show the tax registration number.
- Add a Hijri date beside Gregorian dates on Saudi pages; use Latin digits on Moroccan ones.
- For the Saudi Riyal sign, use a font that has U+20C1, or draw the sign as an inline SVG with «SAR» as its text alternative:

```html
<span class="price">150 <svg aria-hidden="true" class="sar"><use href="#sar" /></svg><span class="sr-only">SAR</span></span>
```

## FAQ

### How does it know which country my page is for?

From what the page says: a `.sa`, `.ae`, `.eg`… domain, `lang="ar-SA"`, a currency like «ر.س» or «د.إ», a number starting `+966` or `+971`. One kind alone is a hint, not enough to name a country: two kinds must agree, and no other country may come within two points of it. A page for several countries, or too little evidence, gets no percentage.

### Why is my page marked ready for a country I did not choose?

Because it says so: a Saudi currency and a `+966` number make a page a Saudi page. If the page is for another country, show that country's currency and calling code, and set its language region.

### Is the percentage a score?

No. It is information: the items that fit over the items we could judge, with at least three judged. It never changes your score.

### What if my site uses the new Saudi Riyal sign in an image?

Then the font check has nothing to judge, which is fine: an image or an inline SVG shows the same on every device.

## Methodology

We read the page's visible text, its `tel:` links, its country domain, its language tag and its hreflang links, name a country only on two agreeing kinds of evidence, and then judge each item the page gives something to judge. The percentage is the fitting items over the judged ones. For the Saudi Riyal sign we render the page in three browsers and read which web font files hold U+20C1. See the rules' pages for the details.
