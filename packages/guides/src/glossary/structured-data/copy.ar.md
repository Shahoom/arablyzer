---
reviewed: false
---

# البيانات المنظّمة (structured data)

البيانات المنظّمة تصف محتوى الصفحة بصيغة معيارية تقرؤها محركات البحث، كسعر المنتج وعملته، فقد تصبح الصفحة مؤهلة للنتائج المنسّقة.

## التعريف

- يعرّف Google البيانات المنظّمة بأنها صيغة معيارية لتقديم معلومات عن الصفحة وتصنيف محتواها، كمكونات الوصفة ومدة طهيها.
- تستخدم في الغالب مفردات Schema.org من الأنواع والخصائص، مثل `Product` و`Offer` و`price`. والمرجع في بحث Google وثائق Google لا وثائق Schema.org.
- يقرأ Google ثلاث صيغ: JSON-LD وMicrodata وRDFa، وينصح بصيغة JSON-LD لأنها الأسهل تطبيقاً وصيانة.

## لماذا يهم

- قد تجعل الصفحة مؤهلة للنتائج المنسّقة (rich results): نتيجة المنتج مثلاً قد تعرض سعره وتوفره وتقييمه.
- لكل نوع من النتائج المنسّقة خصائص مطلوبة، والعنصر الذي تنقصه إحداها غير مؤهل. وحتى الترميز الصحيح لا يضمن ظهور النتيجة المنسّقة.
- يجب أن تصف البيانات ما يراه الزائر في الصفحة نفسها. ووصف محتوى مخفي أو مضلل قد يجلب إجراءً يدوياً يُفقد الصفحة نتائجها المنسّقة، لكنه لا يغيّر ترتيبها.
- وفي متاجر الخليج: يطلب Schema.org أن يُكتب السعر بالأرقام من 0 إلى 9 والنقطة للكسر العشري، وأن تكون العملة في `priceCurrency` برمز ISO 4217، مثل `OMR` و`SAR` و`AED` و`KWD` و`BHD` و`QAR`. أما السعر المنسّق للقارئ، مثل `١٢٫٥٠٠ ر.ع.`، فمكانه الصفحة وحدها.

## مثال

منتج في متجر عماني بصيغة JSON-LD، سعره وعملته كما يطلب Schema.org:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "عسل السدر العماني",
  "image": "https://example.com/images/sidr-honey.jpg",
  "offers": {
    "@type": "Offer",
    "price": "12.500",
    "priceCurrency": "OMR",
    "availability": "https://schema.org/InStock"
  }
}
</script>
```

## أخطاء شائعة

- وصف ما لا تعرضه الصفحة، كتقييم مخفي، أو سعر غير المعروض فيها.
- إغفال خاصية مطلوبة، مثل `price` في `Offer`.
- إغلاق الصفحة أمام Googlebot بملف robots.txt أو بوسم `noindex`، وإرشادات Google تنهى عن ذلك.
- ترك الاختبار: ينصح Google بأداة اختبار النتائج المنسّقة قبل النشر، وبتقارير النتائج المنسّقة في Search Console بعده، لأن القوالب قد تكسر البيانات.

## المراجع

- [Google Search Central: مقدمة عن آلية عمل ترميز البيانات المنظَّمة في بحث Google](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=ar)
- [Google Search Central: الإرشادات العامة حول البيانات المنظَّمة](https://developers.google.com/search/docs/appearance/structured-data/sd-policies?hl=ar)
- [Google Search Central: البيانات المنظَّمة الخاصة بمقتطفات المنتجات](https://developers.google.com/search/docs/appearance/structured-data/product-snippet?hl=ar)
- [Schema.org: price](https://schema.org/price) (بالإنجليزية)
