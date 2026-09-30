---
reviewed: false
---

# إعادة التوجيه (HTTP redirect)

إعادة التوجيه رد من الخادم برمز من فئة 3xx ومعه رابط جديد، ينقل الزائر والزاحف إلى مكان آخر، ونوعه يحدد أي الرابطين يعرضه Google في النتائج.

## التعريف

- يعيد الخادم التوجيه برد يبدأ رمزه بالرقم 3، ومعه ترويسة `Location` فيها الرابط الجديد، فيحمّله المتصفح فوراً.
- الدائمة (`301` و`308`) يعدّها Google إشارة إلى أن الهدف هو الرابط الأساسي، فيعرضه في النتائج. والمؤقتة (`302` و`303` و`307`) يتبعها Googlebot، لكن Google لا يعدّها إشارة إلى الرابط الأساسي، فيبقى الأصلي في النتائج في العادة.
- `307` و`308` تحافظان على طريقة الطلب، فطلب `POST` يبقى `POST`. وتستطيع الصفحة أن تعيد التوجيه بوسم `meta refresh` أو عبر JavaScript، ولا ينصح Google بذلك إلا إن تعذّر غيره.

## لماذا يهم

- التحويل الدائم يوصل الزوار والروابط القديمة إلى العنوان الجديد للصفحة، ويخبر Google بالعنوان الذي يعرضه، وبه يختار الموقع عنواناً واحداً، كتحويل `http` إلى `https`.
- السلاسل الطويلة تضر بالزحف. تتبع زواحف Google حتى 10 تحويلات، وتعرض Search Console السلسلة الطويلة جداً والحلقة المغلقة «خطأ في إعادة التوجيه».
- في المواقع العربية والإنجليزية، يوصي Google بألا تحوّل الزائر تلقائياً إلى اللغة التي تظنها لغته، فقد لا يرى الناس ومحركات البحث كل النسخ. اربط بين النسخ بدلاً من ذلك.

## مثال

متجر نقل صفحة من `https://example.com/عود` إلى `https://example.com/ar/oud`، فيرد الرابط القديم بتحويل دائم:

```http
HTTP/1.1 301 Moved Permanently
Location: https://example.com/ar/oud
```

يعرض Google الرابط الجديد في النتائج، وقد يُظهر القديم أحياناً اسماً بديلاً للجديد إن بدا من البحث أن الباحث يثق به أكثر.

## أخطاء شائعة

- تحويل مؤقت `302` لانتقال دائم. في Apache مثلاً، الأمر `Redirect` دون `permanent` يعطي `302`.
- سلسلة من `http` إلى `https` ثم إلى `www` ثم إلى رابط بشرطة مائلة في آخره، بدل تحويل واحد إلى الرابط النهائي.
- تحويل صفحة محذوفة إلى صفحة لا تشبهها: إن لم يكن لها بديل واضح فالرد الصحيح `404` أو `410`.

## المراجع

- [Google Search Central: عمليات إعادة التوجيه وبحث Google](https://developers.google.com/search/docs/crawling-indexing/301-redirects?hl=ar)
- [Google: كيفية تأثّر زواحف Google برموز حالة HTTP](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes?hl=ar)
- [MDN: إعادة التوجيه في HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Redirections) (بالإنجليزية)
- [مساعدة Search Console: تقرير فهرسة الصفحات](https://support.google.com/webmasters/answer/7440203?hl=ar)
- [Google Search Central: تحديد أخطاء الزحف في بحث Google وحلّها](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors?hl=ar)
- [Google Search Central: إدارة المواقع المتعددة المناطق واللغات](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites?hl=ar)
