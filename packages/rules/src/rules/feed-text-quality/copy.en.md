# Product feed titles and descriptions

## Messages

### title-long

{count} titles are longer than Merchant Center's limit of {max} characters; the first is {id}.

### description-long

{count} descriptions are longer than Merchant Center's limit of {max} characters; the first is {id}.

### title-caps

{count} titles are written in capital letters, such as “{sample}”; the first is {id}.

### title-promotional

{count} titles carry promotional wording, such as “{sample}”; the first is {id}.

### description-same-as-title

{count} descriptions repeat the title word for word, such as “{sample}”; the first is {id}.

### tatweel

{count} titles stretch Arabic letters with tatweel, such as “{sample}”; the first is {id}.

### garbled

{count} products have Arabic text garbled by a wrong encoding, such as “{sample}”; the first is {id}.

## Why it matters

- The title is what a shopper reads in Shopping results, and what Google matches searches to. Over {max} characters it is cut, and the part that matters may be the part cut.
- Merchant Center asks for titles without promotional text («شحن مجاني»، “free shipping”, “sale”) or all capitals, and descriptions that describe the product rather than repeat its name. Products that break these rules can be disapproved or shown less.
- Arabic names suffer from two faults of their own: tatweel («مســك») makes the same product a different word to a search, and text saved in a wrong encoding shows as strange Latin letters.

## How to fix

- Put the product's name, brand and what tells it apart (size, colour, material) in the title, in the order shoppers say them: «عطر العود الملكي 50 مل».
- Keep offers, prices and shipping out of the title; Merchant Center takes them from the price, sale price and shipping attributes.
- Write a real description for each product. If the store has none, add one in the store's product fields; do not copy the title.
- Remove tatweel (ـ) from the names; type the plain letters.
- If letters look like Ø§Ù„Ø¹, the file is saved in one encoding and read in another: export it as UTF-8.

```xml
<title>عطر العود الملكي 50 مل</title>
<description>عطر من خشب العود الطبيعي بتركيز عالٍ ويدوم طويلاً.</description>
```

## How we detect

1. For each product (the first 5,000) we read `title` and `description`.
2. A title or description longer than 150 or 5,000 characters (the specification's limits) is counted by characters, not bytes.
3. A title is in capitals when its Latin letters are more than half of its letters, number at least four and include no lowercase letter.
4. A title carries promotional wording when it holds a phrase of our list, taken from what the specification asks to leave out: «شحن مجاني»، «توصيل مجاني»، «خصم»، «تخفيضات»، «عرض خاص»، «أفضل سعر»، “free shipping”, “sale”, “% off”, “best price”, “buy now”, “limited time”. The list is ours and short; it does not find every offer.
5. A description repeats the title when the two are equal once spaces and capitals are folded.
6. Tatweel inside an Arabic word, and text garbled by a wrong encoding, are found by the same detectors as the page rules about them.
7. Each kind is one finding, with how many products and the first.

## References

- [Google Merchant Center Help: Title](https://support.google.com/merchants/answer/6324415)
- [Google Merchant Center Help: Description](https://support.google.com/merchants/answer/6324468)
- [Google Merchant Center Help](https://support.google.com/merchants/)
