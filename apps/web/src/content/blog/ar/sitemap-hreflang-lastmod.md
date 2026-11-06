---
title: "خريطة الموقع لموقع عربي وإنجليزي: hreflang وlastmod وx-default"
description: "كيف تحمل خريطة XML النسخ العربية والإنجليزية بعناصر xhtml:link، وكيف تكتب lastmod صحيحاً، وما يراه فحص الخريطة وما لا يراه، ومقارنة خريطتين قبل نقل الموقع."
summary: "ما تكتبه في خريطة موقع ثنائي اللغة: النسخ وx-default وتواريخ التعديل، وكيف تفحصها."
date: "2026-11-06"
tags: ["search"]
lang: ar
draft: false
reviewed: false
tools: [hreflang-sitemap-check, sitemap-lastmod-check, sitemap-diff, sitemap-generator, store-hreflang-check, sitemap-check]
rules: [hreflang-sitemap-invalid, hreflang-set-invalid, hreflang-x-default-missing, hreflang-lang-mismatch, sitemap-lastmod-invalid, sitemap-invalid, sitemap-missing]
fix: []
terms: [xml-sitemap, hreflang]
related: [hreflang-arabic-sites, google-indexing-arabic-sites]
---

خريطة الموقع ملف تسرد فيه صفحاتك لمحركات البحث. وفي موقع بنسختين، عربية وإنجليزية، تؤدي ثلاث وظائف: تسرد العناوين، وتقول متى تغيّرت كل صفحة بالعنصر `lastmod`، وتعطي كل صفحة نسخها اللغوية. وهي إحدى ثلاث طرق تقبلها Google لإعلان النسخ، والطريقتان الأخريان وسوم `<link>` في الصفحة وترويسة `Link`.

أساسيات الرموز، وأخطاء الخليج فيها، والروابط المتبادلة، في [مقال hreflang](/blog/hreflang-arabic-sites)، فلا نكررها. هنا طريقة الخريطة من أولها: ما تحمله، وكيف تكتب النسخ و`x-default` و`lastmod`، وأي الفحوص يقرأ الخريطة وأيها لا يقرؤها، وكيف تقارن خريطتين قبل نقل موقعك.

## ما تحمله الخريطة {#basics}

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://shop.example/ar/oud</loc>
    <lastmod>2026-11-02</lastmod>
  </url>
</urlset>
```

- العنصر `loc` وحده إلزامي في كل `url`، و`lastmod` اختياري ([sitemaps.org](https://www.sitemaps.org/protocol.html)). وتقول [Google](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) إنها تتجاهل `priority` و`changefreq`.
- حد الملف الواحد 50,000 عنوان أو 50 ميغابايت قبل الضغط؛ وما زاد تقسّمه وتسرد أجزاءه في فهرس خرائط.
- الترميز UTF-8، وتُكتب `&` في العناوين `&amp;`، والعناوين كاملة وأولها `https://`.
- سمِّ الخريطة في robots.txt بعنوانها الكامل: `Sitemap: https://www.example.com/sitemap.xml`.
- ضعها في جذر الموقع. يقول sitemaps.org إن الخريطة لا تسرد إلا عناوين في مجلدها وما تحته، وهذا يهمك إن فصلت `/ar/` عن `/en/` في مجلدين.
- يطلب البروتوكول ترميز العناوين وفق RFC 3986 وRFC 3987، فالمسار العربي يُكتب فيها مرمَّزاً (`%D9%...`). وأبقِ صيغة العنوان واحدة في `loc` وفي `href` النسخ وفي canonical.

ولا تضمن الخريطة أن تُزحف كل صفحة فيها وتُفهرس. وتقول Google إن موقعاً صغيراً، نحو 500 صفحة أو أقل، جيد الربط الداخلي، قد لا يحتاج إليها ([نظرة عامة](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)). أما إن لم تجدها محركات البحث أو لم تقرأها فهذا ما تكشفه [sitemap-missing](/rules/sitemap-missing) و[sitemap-invalid](/rules/sitemap-invalid)، و[فاحص الخريطة](/tools/sitemap-check) يجد الملف ويقول إن كان XML سليماً بجذر ومساحة اسم صحيحين. وللمصطلح صفحته: [خريطة الموقع](/glossary/xml-sitemap).

## النسخ اللغوية داخل الخريطة {#alternates}

تضيف إلى `urlset` المساحة `xmlns:xhtml`، ثم تسرد تحت كل `url` كل نسخ الصفحة **ومعها نفسها** بعناصر `xhtml:link`. هذا كله لصفحة واحدة بنسختين:

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://shop.example/ar/oud</loc>
    <lastmod>2026-11-02</lastmod>
    <xhtml:link rel="alternate" hreflang="ar" href="https://shop.example/ar/oud"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://shop.example/en/oud"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://shop.example/ar/oud"/>
  </url>
  <url>
    <loc>https://shop.example/en/oud</loc>
    <lastmod>2026-10-20</lastmod>
    <xhtml:link rel="alternate" hreflang="ar" href="https://shop.example/ar/oud"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://shop.example/en/oud"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://shop.example/ar/oud"/>
  </url>
</urlset>
```

الثلاثية نفسها تتكرر تحت كل عنوان، لأن Google تقول إن الصفحة X إن أشارت إلى Y فعلى Y أن تشير إليها، وإلا قد تُتجاهل الإشارات أو لا تُفهم جيداً ([النسخ المحلية](https://developers.google.com/search/docs/specialty/international/localized-versions)). وعناوين النسخ عناوين كاملة بمخططها، وهي نفسها `loc` الصفحات. وكل نسخة تضيفها، كنسخة لدولة أخرى، تزيد عنصراً تحت كل عنوان في الخريطة كلها، فتتكاثر الأسطر بسرعة: ولّدها من بيانات موقعك ولا تكتبها بيدك. ولا تعلن النسخ في الخريطة وفي `<head>` بجوابين مختلفين.

وصفحة لم تُترجم بعد تذكر نفسها وحدها في الخريطة، ولا تشير إلى نسخة إنجليزية غير موجودة. وتحقق أن كل عنوان تشير إليه يردّ 200 ولا يحوّل إلى غيره، فعنوان يردّ بخطأ أو يحوّل لا يصلح هدفاً للإشارة.

يفحص [hreflang-sitemap-invalid](/rules/hreflang-sitemap-invalid) أربع حالات: صفحة تذكر نسخاً ولا تذكر نفسها، ونسخة تذكرها صفحة ولا تذكرها بالمقابل، ورمز لا تقبله Google، وعنوان نسخة ليس كاملاً. وتجده الأداة [فاحص hreflang في الخريطة](/tools/hreflang-sitemap-check) وتسمّي أول مثال لكل حالة. وحدّه أن العودة لا تُفحص إلا لنسخة هي مدخل في الملف نفسه، فنسخة في خريطة أخرى لا يُحكم عليها.

## x-default {#x-default}

تقول Google إن `x-default` يُستعمل حين لا تطابق لغة الباحث ودولته أي نسخة معلنة، وإنه صُمم لصفحات اختيار اللغة، وتوصي به. في المثال أعلاه جعلناه الصفحة العربية لأنها الأصل؛ ولك أن تجعله صفحة تختار منها اللغة.

وهنا فرق بين الفحوص يهمك أن تعرفه.

## ما الذي يراه كل فحص {#coverage}

| أين كتبت hreflang | ما يقرؤه |
| --- | --- |
| وسوم `<link>` في `<head>` الصفحة | [hreflang-set-invalid](/rules/hreflang-set-invalid) و[hreflang-x-default-missing](/rules/hreflang-x-default-missing) و[hreflang-lang-mismatch](/rules/hreflang-lang-mismatch)، والأداة [فاحص hreflang للمتاجر](/tools/store-hreflang-check) |
| خريطة الموقع | [hreflang-sitemap-invalid](/rules/hreflang-sitemap-invalid) والأداة `hreflang-sitemap-check` |

القواعد الثلاث الأولى تقرأ عناصر `<link>` في الصفحة نفسها (وتحسب `x-default-missing` ترويسة `Link` أيضاً)، لا الخريطة. فمن كتب نسخه في الخريطة وحدها لن تعرف له هذه القواعد شيئاً، ولا يتحقق فحص الخريطة من وجود `x-default`، ولا من أن `lang` في الصفحة يوافق الرمز الذي سُجلت به، لأنه لا يقرأ إلا ملفات الخريطة ولا يجلب الصفحات. فتولّى أنت الأمرين: ضع `x-default` وراجع أن `<html lang>` في الصفحة العربية `ar` أو `ar-SA` حسب ما أعلنت.

وللمتاجر ذات الصفحات المنسوخة خطر خاص: يُصنع متجر الإمارات من متجر السعودية فيبقى `lang="ar-SA"` في الرأس، وهذه حالة [hreflang-lang-mismatch](/rules/hreflang-lang-mismatch).

## تواريخ lastmod {#lastmod}

يعرّف [sitemaps.org](https://www.sitemaps.org/protocol.html) `lastmod` بأنه تاريخ آخر تعديل للصفحة لا تاريخ إنشاء الخريطة، بصيغة W3C: `2026-11-02` أو مع وقت ومنطقة زمنية `2026-11-02T08:30:00+03:00`. وتستعمله Google إذا ثبتت دقته باستمرار وأمكن التحقق منه.

- اكتب أرقاماً لاتينية وشرطات. التاريخ `٢٠٢٦-١١-٠٢` أو `02/11/2026` ليس تاريخاً عند الزاحف، وكذلك يوم ليس في التقويم مثل `2026-02-30`.
- لكل نسخة لغوية تاريخها: إن عدّلت النص العربي لا تغيّر تاريخ الإنجليزي، وإن ترجمت بعد أسبوع فتاريخ الترجمة هو تاريخها.
- لا تغيّر التاريخ لتغيير ليس تغييراً، كتذييل جديد أو عدّاد.
- إن لم تستطع تاريخاً صادقاً فاحذف العنصر؛ لا تاريخ أحسن من تاريخ كاذب.

تحكم [sitemap-lastmod-invalid](/rules/sitemap-lastmod-invalid) في حالتين: تاريخ ليس بصيغة W3C، وخريطة فيها عشرة مداخل مؤرَّخة فأكثر كلها بالتاريخ نفسه، وهو في الغالب يوم بناء الملف؛ والعشرة حدّنا نحن. وتفعل أداة [فاحص التواريخ](/tools/sitemap-lastmod-check) الأمر ذاته على خريطتك المنشورة. ولا يقول أي منهما إن التاريخ صادق، فهذا يحتاج تاريخ الصفحة نفسها.

## قارن خريطتين قبل النقل، وولّد خريطة {#diff}

عند إعادة التصميم أو تغيير المنصة، الصق خريطة ما قبل النقل وخريطة ما بعده في [مقارِن الخرائط](/tools/sitemap-diff). يقرأ XML الذي تلصقه في متصفحك ولا يطلب شيئاً من موقعك، ويعرض العناوين المضافة والمحذوفة وما تغيّر تاريخه، وعدد المتطابق.

اقرأ المحذوف أولاً: كل عنوان زال يحتاج تحويلاً دائماً إلى بديله ([نقل موقع مع تغيير العناوين](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)) أو سبباً تستطيع ذكره. وتواريخ تغيّرت في صفحات لم تلمسها تعني أن المنصة تكتب وقت البناء.

وإن لم تجد المنصة خريطة، أو أردت خريطة لجزء من الموقع، فاكتبها بأداة [مولّد الخريطة](/tools/sitemap-generator): تلصق العناوين وتواريخها، فيعطيك ملفاً بمساحة اسم صحيحة، و`&` مهرَّبة، والحروف العربية في العناوين مرمَّزة، ويرفض التواريخ غير الحقيقية ويذكر الأسطر التي تركها بسببها. لكنه يكتب `loc` و`lastmod` فقط، لا `xhtml:link`. واذكر الصفحات التي تريدها في البحث فقط: ترد 200، وليست `noindex`، وهي العنوان المرجعي.

## ترتيب الفحص {#verify}

1. [فاحص الخريطة](/tools/sitemap-check): هل الملف موجود وقابل للقراءة؟ يقرأ أول 3 خرائط يسمّيها robots.txt ولا يتبع فهرساً إلى أجزائه.
2. [فاحص hreflang في الخريطة](/tools/hreflang-sitemap-check): النسخ والرموز.
3. [فاحص التواريخ](/tools/sitemap-lastmod-check): صيغة `lastmod` وتطابقه.
4. [فاحص hreflang للمتاجر](/tools/store-hreflang-check) على صفحة منتج: إن كانت للنسخ أيضاً وسوم في الصفحة.
5. تقرير Sitemaps في Search Console: يعرض الأخطاء التي وجدتها Google في خرائطك.

ويقرأ الفحصان الثاني والثالث أول 5000 مدخل في كل خريطة، ولا يتبعان فهرساً إلى أجزائه.

## قائمة قبل أن تنشر {#checklist}

- الخريطة مسمّاة في robots.txt بعنوان كامل.
- كل `url` يسرد نسخه ونفسه بعناوين كاملة، والرموز مقبولة.
- النسخ تتبادل الإشارة، و`x-default` موجود.
- طريقة واحدة لإعلان النسخ، لا جوابان مختلفان.
- `lastmod` بصيغة W3C وبأرقام لاتينية، وتاريخ كل نسخة تاريخها.
- مقارنة قبل النقل وبعده، وتحويل لكل عنوان محذوف.
