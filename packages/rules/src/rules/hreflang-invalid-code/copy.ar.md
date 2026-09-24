---
reviewed: false
---

# رمز hreflang غير صالح

## الرسائل

### underscore

`hreflang="{hreflang}"` يفصل الأجزاء بشرطة سفلية (_)، والمطلوب شرطة عادية (-).

### unknown-language

`hreflang="{hreflang}"`: الجزء «{language}» ليس رمز لغة من ISO 639-1، وهي رموز من حرفين مثل ar وen.

### unknown-script

`hreflang="{hreflang}"`: الجزء «{script}» ليس رمز خط من ISO 15924.

### unknown-region

`hreflang="{hreflang}"`: الجزء «{region}» ليس رمز بلد من ISO 3166-1 alpha-2، وهي رموز من حرفين مثل SA وAE وOM.

### uk-region

`hreflang="{hreflang}"`: رمز المملكة المتحدة في ISO 3166-1 هو GB لا UK، فالصحيح `{suggestion}`.

### malformed

`hreflang="{hreflang}"` ليس بالصيغة التي يقبلها Google: رمز لغة، ثم رمز خط اختياري، ثم رمز بلد اختياري، أو `x-default`.

## لماذا يهم

- يستخدم Google سمة `hreflang` ليعرض لكل باحث نسخة الصفحة المناسبة للغته وبلده، مثل النسخة السعودية لمن يبحث من السعودية والإنجليزية لمن يبحث بالإنجليزية.
- يقبل Google رموز ISO فقط، وينص على أن الرموز خارجها، مثل `es-419`، غير مدعومة. الرمز غير الصالح لا يفهمه Google، فقد لا تظهر تلك النسخة لمن صُنعت له.
- أخطاء شائعة في مواقع الخليج: `KSA` بدل `SA`، و`UAE` بدل `AE`، و`UK` بدل `GB`، والشرطة السفلية كما في `ar_SA` التي تأتي من إعدادات بعض البرامج.

## كيف تُصلح

استخدم رمز لغة من حرفين، ثم رمز البلد من حرفين إن أردت بلداً بعينه، بينهما شرطة:

```html
<link rel="alternate" hreflang="ar-SA" href="https://example.com/sa/" />
<link rel="alternate" hreflang="ar-AE" href="https://example.com/ae/" />
<link rel="alternate" hreflang="en" href="https://example.com/en/" />
<link rel="alternate" hreflang="x-default" href="https://example.com/" />
```

- رموز دول الخليج: السعودية `SA`، والإمارات `AE`، وعُمان `OM`، والكويت `KW`، والبحرين `BH`، وقطر `QA`.
- `ar` وحده يعني العربية لكل البلدان، و`x-default` للنسخة التي تظهر حين لا تناسب الباحث أي نسخة أخرى.
- لا تكتب رمز البلد وحده: `SA` وحده يعني لغة (السنسكريتية)، لا السعودية.

## كيف نكشف

1. نجمع قيم `hreflang` من وسوم `<link rel="alternate">` في الصفحة ومن ترويسات `Link` في استجابة HTTP.
2. تُقبل `x-default`، أو رمز لغة من ISO 639-1، يليه اختيارياً رمز خط من ISO 15924، ثم رمز بلد من ISO 3166-1 alpha-2، بأي حالة أحرف.
3. قوائم الرموز مأخوذة من سجل IANA لوسوم اللغات، وقائمة البلدان هي الرموز المخصصة رسمياً في ISO 3166-1 فقط.
4. لكل رمز غير صالح مخالفة تذكر الجزء الخاطئ، والتصحيح حين يكون واضحاً.

لا نتحقق في هذه القاعدة من أن الصفحات المرتبطة تشير إلى بعضها في الاتجاهين؛ ذلك يتطلب جلب الصفحات الأخرى.

## المراجع

- [Google: إخبار Google بالنسخ المحلية من صفحتك](https://developers.google.com/search/docs/specialty/international/localized-versions?hl=ar)
- [ISO: رموز البلدان ISO 3166](https://www.iso.org/iso-3166-country-codes.html) (بالإنجليزية)
- [ISO: رموز اللغات ISO 639](https://www.iso.org/iso-639-language-code) (بالإنجليزية)
- [IANA: سجل وسوم اللغات](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry) (بالإنجليزية)
