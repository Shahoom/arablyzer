---
reviewed: false
summary: هل تحمّل صفحتك على HTTPS ملفات أو صوراً عبر HTTP غير المشفّر؟
---

# فحص المحتوى المختلط

يتحقق من أن صفحتك على HTTPS لا تحمّل سكربتات أو ملفات CSS أو إطارات أو صوراً عبر HTTP، ولا ترسل نماذجها إلى عنوان HTTP، وهو ما تمنعه المتصفحات أو تحذّر منه.

## ماذا تفحص

- السكربتات، وملفات CSS والأيقونات في `<link>`، و`iframe` و`object` و`embed` و`track`، والصور في `srcset` و`<picture>` أو على عنوان IP، إذا حُمّلت عبر `http:`، وهي ما تمنعه المتصفحات.
- الصور والفيديو والصوت الأخرى عبر `http:`، التي يطلبها Chrome وFirefox عبر HTTPS بدلاً منه، فتختفي إن لم تكن متاحة هناك.
- النماذج التي ترسل ما يُكتب فيها إلى `http:`، في `action`، أو في `formaction` على زر الإرسال.
- سياسة `upgrade-insecure-requests` في ترويسة `Content-Security-Policy` أو في `<meta>` داخل `<head>`، التي تجعل المتصفح يطلب كل ذلك عبر HTTPS.

## مثال

### خطأ

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <link rel="stylesheet" href="http://cdn.example.com/style.css" />
  </head>
  <body>
    <h1>حلوى عمانية في علب</h1>
    <img src="http://cdn.example.com/halwa.jpg" alt="علبة حلوى عمانية" />
  </body>
</html>
```

### صحيح

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <link rel="stylesheet" href="https://cdn.example.com/style.css" />
  </head>
  <body>
    <h1>حلوى عمانية في علب</h1>
    <img src="https://cdn.example.com/halwa.jpg" alt="علبة حلوى عمانية" />
  </body>
</html>
```

## كيف تُصلح

غيّر `http://` إلى `https://` في عناوين الموارد والنماذج، أو استخدم مسارات تبدأ بـ `/` من الموقع نفسه:

```html
<link rel="stylesheet" href="https://cdn.example.com/style.css" />
<img src="/images/halwa.jpg" alt="علبة حلوى عمانية" />
<form action="https://example.com/subscribe" method="post">
  <button type="submit">اشترك</button>
</form>
```

- المورد من موقع آخر لا يعمل على HTTPS: انقله إلى موقعك، أو استبدله.
- ابحث عن `http://` في قالب الموقع وفي محتوى صفحاته، فالعناوين المكتوبة قبل الانتقال إلى HTTPS تبقى كما كُتبت.
- ترويسة `Content-Security-Policy: upgrade-insecure-requests` تجعل المتصفح يطلب كل عنوان `http:` عبر HTTPS، والنماذج معها، لكن العناوين تبقى خاطئة حيث يُقرأ HTML دونها، فأصلحها أيضاً.

## أسئلة شائعة

### صور صفحتي تظهر، فلماذا تفشل؟

لأن Chrome وFirefox يطلبان الصور والفيديو والصوت عبر HTTPS بدلاً من HTTP، فتظهر إن كانت متاحة هناك، وتختفي إن لم تكن. أما عنوانها في HTML فيبقى `http:`، ومتصفحات أخرى تحمّلها عبر HTTP وتُظهر أن الصفحة غير آمنة.

### هل يكفي `upgrade-insecure-requests`؟

يكفي لتنجح الصفحة في هذا الفحص: يطلب المتصفح كل عنوان `http:` عبر HTTPS، والنماذج معها. ضعه في ترويسة `Content-Security-Policy`، أو في `<meta http-equiv="Content-Security-Policy">` داخل `<head>` قبل العناصر التي يرقّيها. أما ترويسة `Content-Security-Policy-Report-Only` فلا ترقّي شيئاً. وأصلح العناوين نفسها أيضاً، لأنها تبقى خاطئة حيث يُقرأ HTML دون هذه السياسة.

### هل تفحص الأداة ما تحمّله السكربتات وملفات CSS؟

لا. تقرأ الأداة HTML الصفحة كما يرسله الخادم، فلا ترى ما تضيفه السكربتات بعد التحميل، ولا العناوين داخل ملفات CSS، مثل صور الخلفية في `url()`.

## المنهجية

نجلب الصفحة باسم `ArablyzerBot`، ونتبع تحويلاتها، ونقرأ HTML كما يرسله الخادم، قبل تشغيل JavaScript، ومعه ترويسات الاستجابة. تنطبق الأداة على صفحات HTTPS: نبحث فيها عن العناصر التي تحمّل عبر `http:` وعن النماذج التي ترسل إليه، ونحسب كل عنوان كما يحسبه المتصفح، ومنه ما يغيّره `<base>`، ونقرأ `srcset` كما يقرؤه HTML. ونصنّف كل تحميل كما تعامله المتصفحات حسب معيار W3C للمحتوى المختلط: ما تمنعه، وما تطلبه عبر HTTPS بدلاً منه، والنموذج الذي يرسل دون تشفير. السكربت الذي لا يجلبه المتصفح، مثل `nomodule`، لا يُحسب. وتنجح الصفحة التي تطلب `upgrade-insecure-requests` في ترويسة `Content-Security-Policy`، وكذلك ما يأتي بعد `<meta>` تطلبها داخل `<head>`. تعطي الصفحة نفسها النتيجة نفسها في كل فحص.
