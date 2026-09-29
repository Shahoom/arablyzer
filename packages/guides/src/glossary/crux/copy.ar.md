---
reviewed: false
---

# تقرير تجربة المستخدم في Chrome (CrUX)

تقرير CrUX مجموعة بيانات عامة من Google تسجّل تجربة مستخدمي Chrome الحقيقيين مع المواقع، ومنه تأتي بيانات الميدان في PageSpeed Insights وSearch Console.

## التعريف

- تقرير تجربة المستخدم في Chrome (Chrome UX Report) هو مجموعة بيانات برنامج Web Vitals من Google: يعكس تجربة مستخدمي Chrome الحقيقيين مع الوجهات الشائعة على الويب، وفيه كل مؤشرات أداء الويب الأساسية.
- يحسب زيارات من يشاركون إحصاءات الاستخدام، ويزامنون سجل التصفح، ولم يضعوا عبارة مرور للمزامنة، في Chrome على الحاسوب وعلى Android. ولا يحسب Chrome على iOS، ولا WebView في تطبيقات Android، ولا متصفحات Chromium الأخرى مثل Edge.
- تُجمع بياناته لكل صفحة ولكل أصل (origin)، أي الموقع كله، ولكل فئة أجهزة (جوال وحاسوب ولوحي)، على مدى آخر 28 يوماً. وتحدّثها واجهة CrUX البرمجية يومياً، ومجموعة BigQuery شهرياً.

## لماذا يهم

- يستخدم بحث Google بيانات CrUX في عامل الترتيب الخاص بتجربة الصفحة، ومن البيانات نفسها تأخذ PageSpeed Insights وتقرير Core Web Vitals في Search Console.
- ليس كل موقع فيه: يجب أن تكون الصفحة أو الأصل قابلاً للاكتشاف علناً (يرد بالرمز 200، وليس عليه `noindex`)، وله زوار كافون. ولا تعلن Google الحد الأدنى، ولا يمكن إضافة موقع يدوياً، فقد تكون للموقع الصغير بيانات لأصله وحده، أو لا تكون له بيانات أصلاً.
- تُحذف من الروابط معاملات الاستعلام مثل `?utm_medium=email` والأجزاء مثل `#main`، فتُحسب كل زيارات الصفحة معاً.

## مثال

استعلام من واجهة CrUX البرمجية عن صفحة واحدة على الجوال، بمفتاح API من Google Cloud:

```bash
curl -s --request POST 'https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"url": "https://example.com/offers", "formFactor": "PHONE"}'
```

يعطي الرد لكل مقياس نسبة الزيارات في نطاقات الجيد وما يحتاج إلى تحسين والضعيف، والشريحة المئوية 75 (`p75`). وإن لم تكن عنده بيانات عن الصفحة، يرد بالرمز 404، ويمكنك حينها أن تسأله عن الأصل (`origin`).

## أخطاء شائعة

- السؤال عن أصل خاطئ: يحذّر دليل Google من إضافة نطاق فرعي مثل `www` أو إسقاطه خطأً، ومن البروتوكول الخطأ.
- السؤال بدقة زائدة: رابط واحد على الأجهزة اللوحية زياراته أقل، فيكثر ألا تكون له بيانات.
- صفحات لا يفرّق بينها إلا معامل استعلام، مثل `?productID=101` و`?productID=102`: يحذفه CrUX، فقد يحسبها صفحة واحدة.

## المراجع

- [Chrome for Developers: نظرة عامة على CrUX](https://developer.chrome.com/docs/crux) (بالإنجليزية)
- [Chrome for Developers: منهجية CrUX](https://developer.chrome.com/docs/crux/methodology) (بالإنجليزية)
- [Chrome for Developers: واجهة CrUX البرمجية](https://developer.chrome.com/docs/crux/api) (بالإنجليزية)
- [Chrome for Developers: كيفية استخدام CrUX API](https://developer.chrome.com/docs/crux/guides/crux-api) (بالإنجليزية)
