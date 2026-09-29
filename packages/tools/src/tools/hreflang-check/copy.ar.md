---
reviewed: false
summary: هل رموز hreflang في صفحتك رموز لغات وبلدان يفهمها Google؟
---

# فحص hreflang

يتحقق من أن قيم hreflang في صفحتك رموز لغات وبلدان صحيحة من ISO، كما يطلب Google ليعرض لكل باحث نسخة الصفحة المناسبة للغته وبلده: ar-SA، لا ar-KSA ولا ar_SA.

## ماذا تفحص

- قيم `hreflang` في وسوم `<link rel="alternate">` في الصفحة، وفي ترويسات `Link` في استجابة HTTP.
- أن كل قيمة هي `x-default`، أو رمز لغة من حرفين حسب ISO 639-1، ثم رمز خط اختياري حسب ISO 15924، ثم رمز بلد اختياري من حرفين حسب ISO 3166-1.
- الشرطة السفلية بدل الشرطة العادية، كما في `ar_SA`، ورموز البلدان التي ليست في ISO 3166-1، مثل `KSA` و`UAE`.
- رمز `UK` للمملكة المتحدة، وصحيحه `GB`.

## مثال

### خطأ

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <link rel="alternate" hreflang="ar-KSA" href="https://example.com/sa/" />
    <link rel="alternate" hreflang="ar_AE" href="https://example.com/ae/" />
    <link rel="alternate" hreflang="en-UK" href="https://example.com/uk/" />
  </head>
  <body>
    <h1>عروض الأسبوع</h1>
  </body>
</html>
```

### صحيح

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <link rel="alternate" hreflang="ar-SA" href="https://example.com/sa/" />
    <link rel="alternate" hreflang="ar-AE" href="https://example.com/ae/" />
    <link rel="alternate" hreflang="en-GB" href="https://example.com/uk/" />
    <link rel="alternate" hreflang="x-default" href="https://example.com/" />
  </head>
  <body>
    <h1>عروض الأسبوع</h1>
  </body>
</html>
```

## كيف تُصلح

استخدم رمز لغة من حرفين، ثم رمز البلد من حرفين إن أردت بلداً بعينه، بينهما شرطة:

```html
<link rel="alternate" hreflang="ar-SA" href="https://example.com/sa/" />
<link rel="alternate" hreflang="ar-AE" href="https://example.com/ae/" />
<link rel="alternate" hreflang="ar-OM" href="https://example.com/om/" />
<link rel="alternate" hreflang="en" href="https://example.com/en/" />
<link rel="alternate" hreflang="x-default" href="https://example.com/" />
```

- رموز دول الخليج: السعودية `SA`، والإمارات `AE`، وعُمان `OM`، والكويت `KW`، والبحرين `BH`، وقطر `QA`.
- `ar` وحده يعني العربية لكل البلدان، و`x-default` للنسخة التي تظهر حين لا تناسب الباحث أي نسخة أخرى.
- لا تكتب رمز البلد وحده: `SA` وحده رمز لغة صالح (السنسكريتية)، لا السعودية، فلا تعدّه الأداة خطأً.
- إن كانت الرموز من إعدادات اللغة في برنامج موقعك، مثل `ar_SA`، فاكتبها بشرطة عادية: `ar-SA`.

## أسئلة شائعة

### هل أكتب `ar` أم `ar-SA`؟

كلاهما صالح. `ar` يعني العربية لكل البلدان، و`ar-SA` يعني العربية لمن في السعودية. استخدم رمز البلد حين تكون لكل بلد نسخة خاصة به، كأن تختلف الأسعار أو العملة، وإلا فيكفي `ar`.

### لماذا `KSA` و`UAE` و`UK` خطأ؟

لأنها ليست رموز بلدان في ISO 3166-1، ويقبل Google رموز ISO وحدها. الرموز الصحيحة `SA` للسعودية، و`AE` للإمارات، و`GB` للمملكة المتحدة؛ أما `UK` فرمز محجوز في ISO 3166-1، لا رمز مخصص لبلد.

### هل تتحقق الأداة من أن النسخ تشير إلى بعضها؟

لا. يطلب Google أن تذكر كل نسخة نفسها وكل النسخ الأخرى، لكن التحقق من ذلك يتطلب جلب الصفحات الأخرى، والأداة تفحص الصفحة التي تعطيها وحدها.

### أضع `hreflang` في خريطة الموقع، فهل تفحصها الأداة؟

لا. تقرأ الأداة وسوم الصفحة وترويسات استجابتها فقط. فإن كانت رموزك في خريطة الموقع وحدها، لم تجد الأداة ما تفحصه، وقالت إن الفحص لا ينطبق على الصفحة.

## المنهجية

نجلب الصفحة باسم `ArablyzerBot`، ونتبع تحويلاتها، ونقرأ HTML كما يرسله الخادم، قبل تشغيل JavaScript، ومعه ترويسات الاستجابة. نجمع قيم `hreflang` من وسوم `<link rel="alternate">` ومن ترويسات `Link`، ونقبل منها `x-default`، أو رمز لغة من ISO 639-1، ثم رمز خط اختياري من ISO 15924، ثم رمز بلد اختياري من ISO 3166-1 alpha-2، بأي حالة أحرف. قوائم الرموز مأخوذة من سجل IANA لوسوم اللغات، وقائمة البلدان هي الرموز المخصصة رسمياً في ISO 3166-1 وحدها. ولكل رمز غير صالح نتيجة تذكر الجزء الخاطئ، والتصحيح حين يكون واضحاً. تعطي الصفحة نفسها النتيجة نفسها في كل فحص.
