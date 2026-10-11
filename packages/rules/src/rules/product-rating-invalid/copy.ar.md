---
reviewed: false
---

# تقييم المنتج في البيانات المنظّمة غير صالح

## الرسائل

### no-value

التقييم في كتلة JSON-LD رقم {block} (السطر {line}) بلا `ratingValue`.

### no-count

التقييم المجمّع في كتلة JSON-LD رقم {block} (السطر {line}) بلا `reviewCount` ولا `ratingCount`؛ يحتاج Google واحداً منهما.

### bad-number

`{property}` في كتلة JSON-LD رقم {block} (السطر {line}) هو «{value}»، وليس رقماً مكتوباً بالأرقام 0–9 ونقطة.

### out-of-range

قيمة `ratingValue` {value} في كتلة JSON-LD رقم {block} (السطر {line}) خارج المقياس، من {worst} إلى {best}.

### count-zero

التقييم المجمّع في كتلة JSON-LD رقم {block} (السطر {line}) يعدّ {value} مراجعة؛ لا تضع بيانات تقييم إلا إن وُجدت مراجعة واحدة على الأقل.

## لماذا يهم

- نجوم التقييم بجانب المنتج في نتائج البحث تأتي من بيانات تقييمه. ويتجاهل Google تقييماً لا يقرؤه أرقاماً، ولا يؤهّل تقييماً بلا عدد مراجعات.
- المتجر الذي في بياناته أرقام عربية («٤٫٥») تظهر نجومه صحيحة في الصفحة ولا تظهر في Google، لأن JSON-LD يريد الأرقام 0–9 ونقطة.
- تقييم خارج مقياسه أو تجميع بصفر مراجعة بيانات خاطئة في الشيفرة، وإرشادات Google تنهى المواقع عن ذلك.

## كيف تُصلح

اكتب الأرقام كما هي في البيانات لا كما تظهر في الصفحة:

```json
"aggregateRating": {
  "@type": "AggregateRating",
  "ratingValue": "4.5",
  "reviewCount": "128"
}
```

- اطبع `ratingValue` و`bestRating` و`worstRating` و`reviewCount` و`ratingCount` من الرقم المخزّن لا من النص المنسّق في الصفحة.
- المقياس من 1 إلى 5 ما لم تذكر غيره بـ `worstRating` و`bestRating`.
- احذف كتلة `aggregateRating` ما دام المنتج بلا مراجعات.

## كيف نكشف

1. في صفحة تصف منتجاً نقرأ كل `AggregateRating` و`Rating` في JSON-LD (ومنها `reviewRating` في المراجعة).
2. نقرأ في كل منها `ratingValue` و`bestRating` و`worstRating` و`reviewCount` و`ratingCount`: القيمة رقم إن كانت رقم JSON أو نصاً من الأرقام 0–9 مع نقطة اختيارية. أما الأرقام العربية المشرقية والفاصلة وأي نص آخر فليست رقماً.
3. `ratingValue` خارج `worstRating` إلى `bestRating` (من 1 إلى 5 إن لم يُذكرا) خارج المقياس. والتقييم المجمّع يحتاج `reviewCount` أو `ratingCount` ويجب أن يكون 1 على الأقل.

## المراجع

- [Google Search Central: بيانات مقتطف المراجعة المنظّمة](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
- [Schema.org: AggregateRating](https://schema.org/AggregateRating)
