---
summary: Clean a product title for Google Merchant Center: no offers, no capitals, no tatweel.
---

# Product title fixer for Merchant Center

Paste a product title, in Arabic or English, and get it back the way Google Merchant Center asks it to be: the offer taken out, capital English letters written as words, tatweel removed, extra spaces squeezed and the length kept within the limit.

## What it checks

- Promotional wording: «شحن مجاني»، «خصم»، «عرض خاص»، “free shipping”, “sale”, “% off”. Merchant Center asks for the product's name and what tells it apart; offers go in the price, sale price and shipping fields.
- English titles in capitals (`ROYAL OUD PERFUME 50ML`), written as ordinary words with the size kept as one unit.
- Tatweel inside Arabic words (`مســك`): taken out, so a search for «مسك» finds it.
- Length: Merchant Center's limit is 150 characters; the title stops at the last whole word that fits.
- The same words and limits as Arablyzer's feed checker (`feed-text-quality`), so a title that leaves here passes there.

## Example

### Wrong

```xml
<title>مســك أبيض شحن مجاني وخصم ٣٠٪ لفترة محدودة</title>
```

### Right

```xml
<title>مسك أبيض 20 مل</title>
```

## How to fix

Fix the title where the store keeps the product, not in the feed file, so the next export carries it:

```xml
<title>عطر العود الملكي 50 مل</title>
```

- Write the product's name, then its brand and what tells it apart (size, colour, material), in the order shoppers say them.
- Keep offers and prices out of the title. A sale shows through the sale price; shipping through the shipping attribute.
- Write the Arabic and the English titles as two products' fields if the platform has both languages; do not join them in one title.
- If the store builds the feed from rules (a prefix or suffix added to every title), take the offer out of that rule.

## FAQ

### Will Google reject a title with «شحن مجاني» in it?

It may disapprove or ask you to fix the product. The specification asks the title to be the product's name and leave promotions out. Check the status of your products in Merchant Center, which has the last word.

### Why remove tatweel?

Tatweel («ـ») stretches a word's letters on screen but changes its spelling to a search: `مســك` and «مسك» are not the same string. Write the plain letters.

### Does the fixer change the meaning of my title?

It only removes an offer, tatweel and extra spaces, writes English capitals as words, and shortens a title over 150 characters. It does not rewrite your wording. Read the result before you use it.

### Does what I type reach Arablyzer?

No. The fixer runs in your browser, and nothing you type leaves it.

## Methodology

The fixer runs in your browser, with the lists and limits of the `feed-text-quality` rule: promotional phrases from the specification's guidance, the 150-character limit, and the capital-letters test (Latin letters are most of the letters, at least four, none lowercase). An offer after the product's name is cut off together with the dashes and joiners before it; an offer at the start is removed alone. The phrase list is short and ours: it does not find every offer.
