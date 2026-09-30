---
reviewed: false
---

# وسم hreflang

hreflang سمة تخبر Google بأن للصفحة نسخاً بلغات أخرى أو لبلدان أخرى، ليعرض لكل باحث النسخة التي تناسب لغته أو بلده.

## التعريف

- إن كان للصفحة نسخ بلغات أو لمناطق أخرى، فسمة `hreflang` تخبر Google بها ليعرض لكل باحث النسخة المناسبة. وتُكتب في عناصر `<link rel="alternate">` في `<head>` الصفحة، أو في ترويسة `Link` في رد الخادم، أو في خريطة الموقع.
- قيمتها رمز لغة من معيار `ISO 639-1`، ويليه اختيارياً رمز منطقة من معيار `ISO 3166-1 Alpha 2` بينهما شرطة، مثل `ar-SA`. والقيمة `x-default` للنسخة التي تُعرض حين لا تناسب الباحث أي نسخة أخرى.

## لماذا يهم

- في موقع بالعربية والإنجليزية تربط `hreflang` الصفحة العربية بنسختها الإنجليزية، فيعرض Google لكل باحث النسخة التي تناسب لغته.
- نسخ البلدان بالعربية، مثل `ar-SA` و`ar-AE`، مكررة ما دام نصها واحداً، و`hreflang` تخبر Google بأنها نسخ محلية للمحتوى نفسه. وأضف نسخة `ar` عامة لمن يبحث بالعربية من بلد آخر.
- إن لم تُشر كل صفحة إلى الأخرى تجاهل Google الوسوم. ولا يستخدم Google سمة `hreflang` ولا سمة `lang` ليعرف لغة الصفحة، بل يحددها بخوارزمياته.

## مثال

الصفحة العربية في الجذر والإنجليزية تحت `/en/`، والوسوم نفسها في `<head>` كل منهما:

```html
<link rel="alternate" hreflang="ar" href="https://example.com/">
<link rel="alternate" hreflang="en" href="https://example.com/en/">
<link rel="alternate" hreflang="x-default" href="https://example.com/">
```

كل نسخة تذكر نفسها والنسخ الأخرى، بروابط كاملة.

## أخطاء شائعة

- روابط العودة ناقصة: الصفحة العربية تشير إلى الإنجليزية، والإنجليزية لا تشير إليها.
- رموز من خارج المعايير: `UK` بدل `GB`، و`KSA` و`UAE` بدل `SA` و`AE`، والشرطة السفلية كما في `ar_SA` بدل الشرطة.
- رمز البلد وحده: `SA` وحده رمز لغة هي السنسكريتية، لا السعودية.
- روابط نسبية مثل `/en/`، أو روابط `http` بدل روابط `https` الأساسية.

## المراجع

- [Google Search Central: إطلاع Google على النسخ المترجمة من صفحتك](https://developers.google.com/search/docs/specialty/international/localized-versions?hl=ar)
- [Google Search Central: طريقة تحديد عنوان URL الأساسي](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls?hl=ar)
- [IANA: سجل وسوم اللغات](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry) (بالإنجليزية)
