---
reviewed: false
---

# بيانات المنتج تنقصها اسم أو صورة أو عرض

## الرسائل

### no-name

المنتج في كتلة JSON-LD رقم {block} (السطر {line}) بلا `name`.

### no-image

المنتج في كتلة JSON-LD رقم {block} (السطر {line}) بلا `image`؛ يطلب Google صورة ليعرض المنتج في نتائج Shopping.

### no-offer

المنتج في كتلة JSON-LD رقم {block} (السطر {line}) بلا `offers` ولا `review` ولا `aggregateRating`؛ يحتاج Google واحداً منها ليعرض المنتج نتيجة غنية.

## لماذا يهم

- البيانات المنظّمة للمنتج هي ما يقرأ به Google اسم صفحة المنتج وصورتها وسعرها وتقييمها دون تخمين. فبلا اسم أو صورة أو ما يُعرض بجانبهما لا تنال الصفحة نتيجة منتج غنية.
- تذكر وثائق Google أن `name` مطلوب لمقتطفات المنتج، وأن عرضاً أو مراجعة أو تقييماً مجمّعاً هو الجزء المطلوب الثاني، وأن الصورة مطلوبة لقوائم التجار في نتائج Shopping.
- كثيراً ما تطبع قوالب المتاجر البيانات لبعض الحقول فقط، فتبدو الصفحة سليمة والبيانات نصف فارغة.

## كيف تُصلح

ضع في كتلة المنتج نفسه اسمه وعنوان صورته وعرضه:

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "عطر العود الملكي",
    "image": "https://www.example.com/royal-oud.jpg",
    "offers": {
      "@type": "Offer",
      "price": "120.00",
      "priceCurrency": "SAR",
      "availability": "https://schema.org/InStock"
    }
  }
</script>
```

- في سلة وزد وشوبيفاي يكتب القالب أو تطبيق للـ SEO هذه الكتلة: تأكد أن للمنتج صورة رئيسية وسعراً، وأن إصدار القالب حديث.
- في ووردبريس مع ووكومرس تكتبها إضافة SEO (Yoast SEO أو Rank Math) من حقول المنتج.

## كيف نكشف

1. نقرأ كتل JSON-LD التي تُحلَّل ونجد كائنات Product (وأنواعها الأخص في Schema.org) في أعلى الكتلة أو في `@graph`. المنتجات المذكورة داخل قوائم وعروض منتجات صفحات أخرى فلا نحكم عليها.
2. نذكر المنتج لكل مما يلي: لا `name`؛ لا `image`؛ لا `offers` ولا `review` ولا `aggregateRating`. القيم الفارغة لا تُحسب.

المنتج الذي بياناته إشارة `@id` مجردة إلى تعريف في مكان آخر من الصفحة يُقرأ حيث عُرّف.

## المراجع

- [Google Search Central: بيانات المنتج المنظّمة](https://developers.google.com/search/docs/appearance/structured-data/product)
- [Google Search Central: بيانات قوائم التجار المنظّمة](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing)
- [Schema.org: Product](https://schema.org/Product)
