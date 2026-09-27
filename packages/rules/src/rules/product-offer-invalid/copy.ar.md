---
reviewed: false
---

# عرض منتج بلا سعر أو عملة صالحَين (JSON-LD)

## الرسائل

### no-price

كتلة JSON-LD رقم {block} فيها عرض (Offer) بلا سعر (`{property}`)، في السطر {line}.

### bad-price

في كتلة JSON-LD رقم {block}، قيمة `{property}` مكتوبة «{price}» في السطر {line}، وSchema.org يطلب الأرقام 0–9 وحدها، مع النقطة للكسر العشري.

### no-currency

كتلة JSON-LD رقم {block} فيها عرض بلا عملة (`priceCurrency`)، في السطر {line}.

### bad-currency

في كتلة JSON-LD رقم {block}، العملة مكتوبة «{currency}» في السطر {line}، وهي ليست رمزاً من ثلاثة أحرف حسب ISO 4217 مثل OMR أو SAR.

## لماذا يهم

- يقرأ Google سعر المنتج من `offers` في بياناته المنظّمة ليعرضه مع المنتج في نتائج البحث: في مقتطفات المنتجات، وفي قوائم التجار.
- يشترط Google في العرض (`Offer`) وجود `price` أو `priceSpecification.price`، وفي العرض المجمّع (`AggregateOffer`) وجود `lowPrice` و`priceCurrency`. وتشترط قوائم التجار `priceCurrency` في كل عرض، ويوصي بها Google في المقتطفات ليحدد العملة بدقة أكبر. ويقول Google إن الخصائص المطلوبة شرط لتكون الصفحة مؤهلة للنتائج المنسّقة.
- يطلب Schema.org أن يُكتب السعر بالأرقام 0–9 لا برموز تشبهها، وبالنقطة فاصلاً عشرياً لا بالفاصلة، وأن توضع العملة في `priceCurrency` لا رمزاً داخل السعر. والسعر المنسّق للقارئ العربي، مثل «١٢٫٥٠٠ ر.ع.»، صحيح على الصفحة لكنه لا يوافق ذلك في البيانات.

## كيف تُصلح

- اكتب السعر بالأرقام 0–9 والنقطة، بلا فواصل آلاف ولا رمز عملة: `"price": "12.500"` أو `"price": 12.5`.
- ضع العملة في `priceCurrency` برمزها من ثلاثة أحرف: `OMR` للريال العماني، و`SAR` للريال السعودي، و`AED` للدرهم الإماراتي، و`KWD` للدينار الكويتي، و`BHD` للدينار البحريني، و`QAR` للريال القطري.
- للمنتج الذي له عدة أسعار (`AggregateOffer`) اكتب `lowPrice`، و`highPrice` إن شئت، مع `priceCurrency`.
- ولِّد الكتلة من قيمة السعر المخزّنة في قاعدة البيانات، لا من النص المنسّق للعرض على الصفحة:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "عطر العود الملكي",
  "offers": {
    "@type": "Offer",
    "price": "12.500",
    "priceCurrency": "OMR",
    "availability": "https://schema.org/InStock"
  }
}
```

- بعد الإصلاح اختبر الصفحة في أداة Google لاختبار النتائج المنسّقة.

## كيف نكشف

1. نقرأ كل كتلة JSON-LD صالحة في الصفحة، بما فيها `@graph`، ونترك الكتل المعطوبة لقاعدة jsonld-syntax-error. ونجد المنتجات بنوعها (`@type`): `Product` وأنواعه الأخص في Schema.org، مثل `Car` و`ProductGroup`.
2. لكل عرض في `offers` (عرض واحد أو قائمة) نبحث عن السعر في `price` أو `priceSpecification.price`، أو في `lowPrice` للعرض المجمّع، وعن العملة في `priceCurrency`. والعرض المذكور بمعرّفه (`@id`) وحده نقرؤه من العنصر الذي يحمل هذا المعرّف في الصفحة.
3. نقبل السعر إذا كان رقماً، أو نصاً من الأرقام 0–9 فيه نقطة واحدة على الأكثر، ونقبل العملة إذا كانت من رموز قائمة ISO 4217 (كما نشرتها الجهة المسؤولة عنها في 2026-09-17)، بأي حالة أحرف.
4. لا نفحص المنتج الذي بلا عروض، لأن Google يقبل بدلها المراجعات أو التقييم، ولا عروض الطلب (`Demand`)، ولا البيانات المكتوبة بـMicrodata أو RDFa.

## المراجع

- [Google: البيانات المنظَّمة لمقتطفات المنتجات](https://developers.google.com/search/docs/appearance/structured-data/product-snippet?hl=ar)
- [Google: البيانات المنظَّمة لقوائم التجار](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing?hl=ar)
- [Schema.org: price](https://schema.org/price) (بالإنجليزية)
- [Schema.org: priceCurrency](https://schema.org/priceCurrency) (بالإنجليزية)
- [SIX: قوائم رموز العملات ISO 4217 من الجهة المسؤولة عنها](https://www.six-group.com/en/products-services/financial-information/data-standards.html) (بالإنجليزية)
