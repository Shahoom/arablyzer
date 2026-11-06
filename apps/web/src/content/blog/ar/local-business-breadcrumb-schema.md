---
title: "بيانات النشاط التجاري ومسار التنقل المنظّمة للمواقع الخليجية"
description: "كيف تكتب LocalBusiness وBreadcrumbList بصيغ يقرؤها Google: عنوان خليجي برمز الدولة والرمز البريدي، وأوقات دوام بأيام إنجليزية، ومسار تنقل مرقّم، وفحص كيان العلامة."
summary: "العنوان الخليجي وأوقات الدوام والهاتف ومسار التنقل بصيغ يقرؤها Google."
date: "2026-11-06"
tags: ["search"]
lang: ar
draft: false
reviewed: false
tools: [local-business-check, breadcrumb-check, schema-generator, structured-data-check, address-format, brand-name-check]
rules: [local-business-invalid, address-schema-gulf, breadcrumb-schema-invalid, knowledge-graph-entity]
fix: []
terms: [json-ld, structured-data]
related: [product-schema-and-feeds, store-trust-pages-payments]
---

لمتجرك أو مطعمك أو عيادتك اسم وعنوان وهاتف وساعات دوام، ولصفحاتك مسار من الرئيسية إلى القسم إلى الصفحة. تقول ذلك لـ Google بنوعين من [البيانات المنظّمة](/glossary/structured-data) تكتبهما بصيغة [JSON-LD](/glossary/json-ld): `LocalBusiness` للنشاط، و`BreadcrumbList` للمسار.

والصفحة العربية تعرض «السبت» و«9:00 ص» وأرقام الهاتف بالأرقام العربية، وهذه صيغ للقارئ. أما Schema.org فيريد أسماء أيام إنجليزية وأوقاتاً بنظام 24 ساعة وأرقاماً من 0 إلى 9. نمر على كل حقل وما يُفحص فيه، ثم نذكر ما يخص كيان العلامة في Knowledge Graph.

## ما تطلبه Google من النشاط المحلي {#local-business}

تطلب [وثائق Google للنشاط المحلي](https://developers.google.com/search/docs/appearance/structured-data/local-business) `name` و`address` من نوع `PostalAddress`، وتوصي بـ`telephone` مع رمز الدولة، و`openingHoursSpecification`، و`geo`، و`url`. وتحكم قاعدة [local-business-invalid](/rules/local-business-invalid) على النشاط الذي تصف به الصفحة نفسها، من نوع `LocalBusiness` أو أنواعه الشائعة مثل `Store` و`Restaurant` و`Pharmacy` و`MedicalClinic`. والمتجر الإلكتروني بلا مكان مادي منظمة `Organization`، فلا يُفحص هنا. وتقرأ القاعدة النشاط في المستوى الأعلى من الكتلة أو داخل `@graph`.

هذه كتلة سليمة لمتجر في مسقط، تضعها في عنصر `script` نوعه `application/ld+json`:

```json
{
  "@context": "https://schema.org",
  "@type": "Store",
  "name": "متجر الواحة للعطور",
  "url": "https://www.example.com/",
  "telephone": "+96891234567",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "شارع الخليج",
    "addressLocality": "مسقط",
    "addressRegion": "محافظة مسقط",
    "postalCode": "112",
    "addressCountry": "OM"
  },
  "geo": { "@type": "GeoCoordinates", "latitude": 23.58813, "longitude": 58.38294 },
  "openingHoursSpecification": {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Saturday", "Sunday"],
    "opens": "09:00",
    "closes": "21:00"
  }
}
```

الاسم والشارع والمدينة نصوص بلغة الصفحة. أما ما سواها فللآلة، وفيه تقع أخطاء العربية.

## العنوان الخليجي {#address}

تشير [address-schema-gulf](/rules/address-schema-gulf) إلى ثلاثة أخطاء في `PostalAddress`: دولة مكتوبة اسماً بدل رمز، ورمز بريدي بأرقام عربية شرقية، ورمز بريدي على صورة لا تطابق دولته. يوصي [Schema.org](https://schema.org/PostalAddress) برمز ISO 3166-1 من حرفين في `addressCountry`، فاكتب `SA` لا «السعودية» ولا `Saudi Arabia`. والرمز البريدي بأرقام 0–9 على الصورة التي يعتمدها بريد كل دولة، كما تعتمدها القاعدة:

| الدولة | `addressCountry` | الرمز البريدي |
|---|---|---|
| السعودية | `SA` | 5 أرقام |
| الكويت | `KW` | 5 أرقام |
| عُمان | `OM` | 3 أرقام |
| البحرين | `BH` | 3 أو 4 أرقام |
| الإمارات | `AE` | لا نظام: احذف `postalCode` |
| قطر | `QA` | لا نظام: احذف `postalCode` |

أما `streetAddress` و`addressLocality` و`addressRegion` فنصوص بلغة الصفحة، وتنصح Google بتعبئة أكبر عدد ممكن من حقول العنوان. والرمز المختلق لدولة بلا نظام أسوأ من غيابه. وفي السعودية يضيف العنوان الوطني 4 أرقام لا تدخل في `postalCode` إلا بصيغة `12345-6789`. وصور الرموز ينشرها البريد وقد تتغير. [فاحص صيغة العنوان الخليجي](/tools/address-format) يطبق هذه القواعد على كل عنوان في الصفحة، ولا يتحقق أن العنوان موجود.

## البيانات تصف ما في الصفحة {#match}

تقول [Google](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) إن البيانات المنظّمة تصف محتوى الصفحة التي هي فيها، وتنهى عن وسم معلومة لا يراها الزائر ولو كانت صحيحة. لذلك اكتب الهاتف والأوقات والعنوان التي تعرضها الصفحة نفسها. ولمن له أكثر من فرع: ضع كتلة كل فرع في صفحة ذلك الفرع، واجعل `url` فيها عنوان الفرع كاملاً، فتطلب Google أن يكون رابطاً يعمل. وإن تغيّرت الأوقات في موسم فغيّرها في الصفحة والكتلة معاً، والقالب الذي يطبع الاثنتين من حقل واحد لا يُنتج تناقضاً.

## الهاتف وأوقات الدوام والإحداثيات {#hours}

هذه الحقول الثلاثة تفشل بصمت حين تُكتب كما تُعرض:

```json
"telephone": "٩٦٨٩١٢٣٤٥٦٧+",
"dayOfWeek": ["السبت", "الأحد"],
"opens": "9:00 ص"
```

وهي في صيغة Schema.org:

```json
"telephone": "+96891234567",
"dayOfWeek": ["Saturday", "Sunday"],
"opens": "09:00"
```

- **الهاتف:** `+` ثم رمز الدولة ثم الرقم بالأرقام 0–9. الرقم المحلي الذي يبدأ بصفر لا يُطلب إلا من داخل الدولة.
- **الأيام:** `Monday` إلى `Sunday`، ويقبل Google أيضاً العنوان الكامل مثل `https://schema.org/Monday`.
- **الأوقات:** نظام 24 ساعة بلا «ص» ولا «م». تقول Google إن الصيغة `hh:mm:ss` وأمثلتها `hh:mm`، وتقبل القاعدة الاثنتين. ويقول [Schema.org](https://schema.org/OpeningHoursSpecification) إن `closes` الأقل من `opens` يمتد إلى اليوم التالي، فمقهى يغلق عند `01:00` يكتب ذلك.
- **الإحداثيات:** أرقام بنقطة مثل `23.58813`، وتطلب Google خمس منازل عشرية على الأقل.
- **`openingHours` النصي:** أي حرف عربي فيه خطأ.

[فاحص النشاط المحلي](/tools/local-business-check) يعدّ هذه الأخطاء، ويفحص الاسم والعنوان. وحين تعرّف النشاط بلغتين اكتب `name` بـ`@language` للعربية والإنجليزية. وأبقِ الأوقات في ملفك على Google Business Profile كما هي في الصفحة.

## مسار التنقل {#breadcrumb}

تطلب [وثائق Google للمسار](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb) `itemListElement` فيه عنصران على الأقل، ولكل عنصر `position` وهو عدد صحيح يبدأ بـ1، و`name`، و`item` بعنوان الصفحة، ويجوز للعنصر الأخير ترك `item`. وتوصي بمسار يمثل طريق الزائر لا بنسخ بنية العنوان. وتفحص [breadcrumb-schema-invalid](/rules/breadcrumb-schema-invalid) ستة أخطاء، من غياب العناصر إلى العنوان النسبي: المواضع تتتابع 1 و2 و3، والعنوان كامل بمخطط. وهي تكتفي بعنصر واحد في القائمة، فلا تعتمد عليها في شرط العنصرين.

الخطأ الذي يخص العربية هو الموضع بأرقام عربية، لأن القالب يطبع الرقم المنسّق:

```json
{ "@type": "ListItem", "position": "١", "name": "الرئيسية", "item": "/" },
{ "@type": "ListItem", "position": 2, "item": "https://www.example.com/perfumes" },
{ "@type": "ListItem", "position": 3, "name": "عطر العود الملكي" }
```

العنصر الأول موضعه وعنوانه خطأ، والثاني بلا اسم. وهكذا يصح:

```json
{ "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": "https://www.example.com/" },
{ "@type": "ListItem", "position": 2, "name": "العطور", "item": "https://www.example.com/perfumes" },
{ "@type": "ListItem", "position": 3, "name": "عطر العود الملكي" }
```

والاسم `name` هو نص العنصر كما تعرضه الصفحة بالعربية، والعنوان `item` وحده يجب أن يكون كاملاً. اطبع `position` من عدّاد في القالب. [فاحص المسار](/tools/breadcrumb-check) يفحص البيانات وحدها، لا المسار الذي تعرضه الصفحة، فتأكد أن الاثنين يقولان الشيء نفسه.

## كتلة واحدة مكسورة تُسقط كل شيء {#syntax}

تهمل Google الكتلة التي لا تُقرأ كلها، لا السطر الخاطئ وحده. [فحص البيانات المنظّمة](/tools/structured-data-check) يقرأ كل كتلة بصرامة JSON ويذكر أول خطأ بالسطر والعمود: فاصلة قبل `}`، أو علامة تنصيص داخل النص، أو سطر جديد داخل نص. وفي الأسماء العربية تصلح علامتا «» اللتان لا تحتاجان تهريباً. والأفضل أن تولّد الكتلة بدالة ترميز مثل `JSON.stringify` أو `json_encode` من حقول مخزّنة. أما [مولّد البيانات المنظّمة](/tools/schema-generator) فيكتب كتلة `Product` وحدها، فللنشاط والمسار تكتب الكتلة من قالبك.

## كيان العلامة في Knowledge Graph {#entity}

قاعدة [knowledge-graph-entity](/rules/knowledge-graph-entity) معلومة لا تُخصم من الدرجة. بمفتاح Google API تسأل [Knowledge Graph Search API](https://developers.google.com/knowledge-graph) عن اسم علامتك بالعربية والإنجليزية: تأخذه من `Organization` أو `WebSite` في JSON-LD، وإلا من `og:site_name` أو العنوان. يذهب الاسم إلى Google وحده لا عنوان الصفحة. إن عرفت Google كياناً بالاسم ذكرت القاعدة نوعه ووصفه ومقالة ويكيبيديا واللغة التي سألنا بها، فقد تعرف اسمك بإحداهما دون الأخرى. وإن لم تعرفه فأكثر المواقع الصغيرة كذلك، وليس هذا عيباً. ولا شيء يُصلَح في الصفحة ولا طريقة لطلب كيان. وتحذر Google أن الواجهة لا تصلح خدمةً حرجة في الإنتاج، فاقرأ النتيجة معلومة.

وما قد يساعد Google على التعرف عليك: اسم واحد في كل مكان، فاستعن بـ[فاحص اتساق اسم العلامة](/tools/brand-name-check)، وبيانات `Organization` فيها `name` و`url` و`logo` و`sameAs`، وتقول [Google](https://developers.google.com/search/docs/appearance/structured-data/organization) إنها تساعد على فهم منظمتك وتمييزها في النتائج.

## كيف تفحص بالترتيب {#verify}

1. ابدأ بـ`structured-data-check` لتتأكد أن الكتل تُقرأ، فكتلة مكسورة تُهمل كلها.
2. افحص صفحة الفرع بـ`local-business-check` ثم `address-format`، وقارن ما يقوله الفاحص بما تعرضه الصفحة.
3. افحص صفحة قسم وصفحة منتج بـ`breadcrumb-check`، وقارن المسار بالمسار الظاهر للزائر.
4. اختبر الصفحة في أداة Google لاختبار النتائج المنسّقة، فأدواتنا لا تغني عنها.

الأدوات تقرأ JSON-LD في HTML كما يرسله الخادم، فلا ترى كتلة يضيفها سكربت بعد التحميل. ولبيانات المنتج في المتجر نفسه اقرأ [مقال بيانات المنتج وملف المنتجات](/blog/product-schema-and-feeds).

## قائمة قبل أن تنشر {#checklist}

- للنشاط `name` و`address` فيه شارع أو منطقة أو إقليم أو رمز بريدي.
- `addressCountry` رمز من حرفين، والرمز البريدي بالأرقام 0–9 على صورة دولته أو محذوف حيث لا نظام.
- الهاتف يبدأ بـ`+` ورمز الدولة.
- الأيام بالإنجليزية والأوقات بنظام 24 ساعة.
- المسار يبدأ بـ1 ويتتابع، وعناوينه كاملة.
- كل كتلة JSON سليمة.
