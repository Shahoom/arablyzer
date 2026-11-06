---
title: "بيانات المنتج المنظّمة وملف المنتجات لمتجر عربي: السعر والتوفّر والتقييم"
description: "ما تحتاجه صفحة المنتج وملف Google Merchant من خصائص، وكيف تكتب السعر والعملة والتوفّر والتقييم بصيغة تقرؤها الآلة، وأخطاء المتاجر العربية الشائعة فيها."
summary: "الخصائص المطلوبة وصيغ السعر والتوفّر والتقييم في الصفحة وفي ملف المنتجات."
date: "2026-11-06"
tags: ["ecommerce", "search"]
lang: ar
draft: false
reviewed: false
tools: [product-schema-check, product-page-check, feed-check, feed-file-check, schema-generator]
rules: [product-required-missing, product-offer-invalid, product-availability-invalid, product-rating-invalid, feed-file-unreadable, feed-required-missing, feed-text-quality, feed-values-invalid]
fix: []
terms: [json-ld, structured-data]
related: [salla-zid-seo-mistakes, local-business-breadcrumb-schema, store-trust-pages-payments]
---

لصفحة المنتج في متجرك قارئان من الآلات، ولا يقرأ أيٌّ منهما ما يقرؤه الزائر. بحث Google يقرأ كتلة [JSON-LD](/glossary/json-ld) داخل الصفحة، وGoogle Merchant Center يقرأ ملف المنتجات الذي ترفعه أو تربطه. وكلاهما يريد السعر والتوفّر بصيغ محددة، وتزيد الصفحة التقييم.

والمشكلة في المتجر العربي أن القالب يكتب في البيانات ما يظهر للزائر: `١٢٠ ر.س` و«متوفر» و`٤٫٥`. تبدو الصفحة سليمة، وتبقى البيانات غير مقروءة، ولا ينبهك أحد. نمر هنا على [البيانات المنظّمة](/glossary/structured-data) للمنتج ثم على ملف المنتجات، ونقول لكل جزء ما الذي يُفحص وكيف يُصلح. ولا نعد بنتيجة غنية في البحث: Google هي التي تقرر متى تعرضها.

## الصفحة والملف: قارئان وصيغتان {#two-readers}

المنتج نفسه يُكتب مرتين بصيغتين مختلفتين:

| | كتلة JSON-LD في الصفحة | ملف المنتجات |
|---|---|---|
| من يقرؤه | بحث Google | Merchant Center |
| السعر | `"price": "120.00"` | `<g:price>120.00 SAR</g:price>` |
| العملة | حقل مستقل `priceCurrency` | رمز ISO بعد الرقم بمسافة |
| التوفّر | `https://schema.org/InStock` | `in_stock` |

لذلك قد يصيب متجر في إحدى الصيغتين ويخطئ في الأخرى. أصلح كل صيغة حيث تُصنع: القالب أو تطبيق الـ SEO للصفحة، وتصدير Google Shopping أو إضافة الملف للملف.

## ما تطلبه Google في كتلة المنتج {#required}

تطلب [وثائق Google لمقتطفات المنتج](https://developers.google.com/search/docs/appearance/structured-data/product-snippet) `name` وواحداً من `offers` أو `review` أو `aggregateRating`. وتزيد [وثائق قوائم التجار](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing) صورة المنتج `image`، وسعراً وعملة في كل عرض، على أن يكون السعر أكبر من صفر. وتشترط أن تكون عناوين الصور قابلة للزحف والفهرسة. وتعدّ قاعدة [product-required-missing](/rules/product-required-missing) ما ينقص: منتج بلا اسم، أو بلا صورة، أو بلا عرض ولا مراجعة ولا تقييم مجمّع.

تُكتب الكتلة داخل عنصر `script` نوعه `application/ld+json`. وهذا مثال لكتلة تبدو معقولة لمن يقرأ العربية ولا تقرؤها Google:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "عطر العود الملكي",
  "offers": {
    "@type": "Offer",
    "price": "١٢٠٫٠٠",
    "priceCurrency": "ر.س",
    "availability": "متوفر"
  },
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "٤٫٥" }
}
```

وهذه صورتها الصحيحة، بصورة للمنتج وعدد للمراجعات:

```json
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
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "reviewCount": "128"
  }
}
```

## السعر والعملة {#price}

السعر في البيانات رقم للآلة لا نص للقارئ. تقول Google إن قيمة `price` تكون نصاً أو رقماً مثل `39.99`، وإن `priceCurrency` رمز ISO 4217 من ثلاثة أحرف. وتلخص قاعدة [product-offer-invalid](/rules/product-offer-invalid) ما يطلبه Schema.org: الأرقام 0 إلى 9، ونقطة للكسر، وبلا رمز عملة داخل السعر. فاطبع السعر من القيمة المخزّنة في قاعدة البيانات لا من النص المنسّق، وضع العملة في حقلها برمزها: `SAR` أو `AED` أو `OMR` أو `KWD` أو `BHD` أو `QAR`.

للمنتج الذي له عدة أسعار تستعمل `AggregateOffer` وتكتب `lowPrice` مع `priceCurrency`، كما تطلب Google. وللريال العماني والدينارين الكويتي والبحريني ثلاث منازل عشرية، فالسعر `12.500`. و[فحص صفحة المنتج](/tools/product-page-check) يقرأ السعر والعملة في الكتلة، ثم يقرأ النص المرئي ويشير إلى سعر بهذه العملات كُتب بمنزلة أو منزلتين. وإن أردت كتلة جاهزة فـ[مولّد البيانات المنظّمة](/tools/schema-generator) يحوّل الأرقام العربية المشرقية إلى 0–9 ويكتب العملة بمنازلها، ويعمل في متصفحك ولا يرسل شيئاً مما تكتبه.

## التوفّر والتقييم {#availability-rating}

التوفّر قيمة من [ItemAvailability في Schema.org](https://schema.org/ItemAvailability) مثل `InStock` و`OutOfStock` و`PreOrder` و`BackOrder`، والأحرف الكبيرة مهمة: `InStock` لا `Instock`. وتقبل Google أيضاً الاسم المجرد بلا عنوان كما تقول [وثائقها](https://developers.google.com/search/docs/appearance/structured-data/product-snippet). وقاعدة [product-availability-invalid](/rules/product-availability-invalid) تفرّق بين خطأين: كلمة عادية مثل «متوفر» (`text`)، وعنوان من schema.org لقيمة غير موجودة (`unknown`). اربط حالات المتجر بالقيم في القالب أو في إعدادات تطبيق الـ SEO، لا في نص المنتج.

أما التقييم فتطلب [وثائق Google للمراجعات](https://developers.google.com/search/docs/appearance/structured-data/review-snippet) فيه `ratingValue` مع `ratingCount` أو `reviewCount`، وتفترض مقياساً من 1 إلى 5 ما لم تضبط `bestRating` و`worstRating`، وتطلب نقطة لا فاصلة. وتفحص [product-rating-invalid](/rules/product-rating-invalid) خمس حالات: قيمة غائبة، وعدد غائب، ورقم غير مكتوب بالأرقام 0–9، وقيمة خارج المقياس، وتقييم مجمّع يعدّ صفر مراجعة. ومنتج بلا مراجعات لا كتلة تقييم له، فاحذفها.

## ملف المنتجات: هل يُقرأ أصلاً؟ {#feed-readable}

قبل أن تفحص ما في الملف تأكد أنه ملف. تسرد [feed-file-unreadable](/rules/feed-file-unreadable) الأسباب: العنوان صفحة ويب لا ملف، أو الملف فارغ، أو ليس UTF-8 صالحاً، أو XML ينكسر عند سطر وعمود، أو جذره ليس `rss` ولا `feed` (خريطة الموقع ليست ملف منتجات)، أو لا منتجات فيه، أو ملف نصي بلا صف أول يسمّي الأعمدة. وملف `.gz` لا يقرؤه هذا الفحص، فتقول القاعدة إنها لم تستطع الفحص ولا تعدّه عيباً.

للترميز أهمية خاصة في العربية. تذكر [مواصفة الملف النصي](https://support.google.com/merchants/answer/160567) أن الحفظ بترميز غير UTF-8 أو UTF-16 سبب معتاد لأخطاء المعالجة، وأن الصف الأول يحمل أسماء السمات مفصولة بعلامات جدولة. وفي ملف RSS يجب [إعلان فضاء الأسماء](https://support.google.com/merchants/answer/160589) `g`، وكل سمة لا تحمل بادئته تُتجاهل. جرّب [فاحص ملف المنتجات](/tools/feed-file-check): أعطه عنوان الملف نفسه لا عنوان المتجر.

## السمات والقيم والنصوص في الملف {#feed-content}

السمات السبع التي تطلبها [مواصفات Merchant Center](https://support.google.com/merchants/answer/7052112) لكل منتج هي `id` و`title` و`description` و`link` و`image_link` و`price` و`availability`. تعدّ [feed-required-missing](/rules/feed-required-missing) المنتجات التي تنقصها إحداها، وتشير إلى المعرّف المكرر. ولا تفحص السمات الاختيارية ولا شروط كل دولة، وتذكر المواصفات سمات يطلبها بعض الفئات والدول مثل `brand`. ولكل متغيّر من المنتج له سعر أو مخزون خاص `id` خاص به، ويشاركه المنتج في `item_group_id`، فلا يطغى متغيّر على آخر.

القيم هي مكان أخطاء المتاجر العربية. تجمعها [feed-values-invalid](/rules/feed-values-invalid) هكذا:

| ما يكتبه القالب | ما يقبله الملف |
|---|---|
| `متوفر` | `in_stock` أو `out_of_stock` أو `preorder` أو `backorder` |
| `١٢٠ ر.س` | `120.00 SAR` |
| `120,50 SAR` | `120.50 SAR` |
| `/p/oud-1` | `https://shop.example/p/oud-1` |
| سعر تخفيض أعلى من السعر | سعر تخفيض أقل منه وبعملته |
| `gtin` بطول أو رقم تحقق خاطئ | 8 أو 12 أو 13 أو 14 رقماً برقم تحقق صحيح |

وتحكم [feed-text-quality](/rules/feed-text-quality) على النصوص: عنوان أطول من 150 حرفاً، أو وصف أطول من 5000، أو عنوان بأحرف لاتينية كبيرة، أو بألفاظ ترويجية مثل «شحن مجاني»، أو وصف يكرر العنوان، أو تطويل مثل `مســك`، أو نص أفسده الترميز مثل `Ø§Ù„Ø¹`. قائمة الألفاظ الترويجية عندنا قصيرة ولا تجد كل عرض. ضع العروض والشحن في سمات السعر والشحن لا في العنوان. وهذا عنصر سليم:

```xml
<item>
  <g:id>OUD-1</g:id>
  <title>عطر العود الملكي 50 مل</title>
  <description>عطر من خشب العود الطبيعي بتركيز عالٍ.</description>
  <link>https://shop.example/p/oud-1</link>
  <g:image_link>https://shop.example/img/oud-1.jpg</g:image_link>
  <g:price>120.00 SAR</g:price>
  <g:availability>in_stock</g:availability>
</item>
```

## كيف تفحص بالترتيب {#verify}

1. افحص صفحة منتج بـ[فاحص بيانات المنتج](/tools/product-schema-check) للاسم والصورة والعرض والتوفّر والتقييم، ثم بفاحص صفحة المنتج للسعر والعملة. الأداتان تقرآن HTML كما يرسله الخادم وJSON-LD وحده، فلا ترى إحداهما كتلة يضيفها سكربت بعد التحميل ولا Microdata ولا RDFa.
2. افحص عنوان الملف بـ`feed-file-check`، وإذا قُرئ فافحص منتجاته بـ[فاحص ملف Merchant](/tools/feed-check). يقرأ أول 5000 منتج بطلب واحد، ولا يفتح روابط المنتجات.
3. بعد الإصلاح اجلب الملف من جديد في Merchant Center وراجع تشخيصاته. أدواتنا تفحص نص الملف، وMerchant Center يفحص موقعك وإعدادات الشحن والضريبة وقواعد الدولة. واختبر الصفحة أيضاً في أداة Google لاختبار النتائج المنسّقة.

وللأخطاء المجاورة في المتاجر على سلة وزد، اقرأ [أخطاء سلة وزد الشائعة](/blog/salla-zid-seo-mistakes).

## قائمة قبل أن تنشر {#checklist}

- للمنتج في كتلته `name` و`image` وعرض أو تقييم.
- السعر رقم بالأرقام 0–9 ونقطة، والعملة في `priceCurrency` برمز ISO.
- ثلاث منازل للريال العماني والدينارين الكويتي والبحريني.
- التوفّر قيمة من Schema.org في الصفحة، و`in_stock` أو أخواتها في الملف.
- التقييم أرقام ولا كتلة له بلا مراجعات.
- الملف UTF-8، وجذره `rss` أو `feed`، وفيه منتجات.
- السمات السبع في كل منتج، والمعرّفات لا تتكرر، والروابط كاملة بـ`https://`.
- العناوين بلا ترويج ولا تطويل، والأوصاف لا تكرر العناوين.
