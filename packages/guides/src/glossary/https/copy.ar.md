---
reviewed: false
---

# بروتوكول HTTPS

HTTPS نسخة مشفّرة من HTTP تستخدم TLS، تمنع من في الطريق من قراءة ما يتبادله الزائر والموقع أو تغييره، ويشترطها المتصفح لميزات كثيرة ويفضّلها Google.

## التعريف

- HTTPS نسخة من HTTP مشفّرة عبر TLS. ورابط `https` يعني أن الخادم أثبت أنه يمثّل النطاق المطلوب، وأن الاتصال محمي من القراءة والتعديل.
- يتحقق المتصفح من شهادة الخادم: إن لم تكن صالحة للنطاق أوقف الاتصال، أو طلب موافقة المستخدم أولاً. ونسختا `http` و`https` من الرابط نفسه أصلان (origins) مختلفان.

## لماذا يهم

- يضمن للزائر أن أحداً بينه وبين الموقع لم يتجسس على ما يتبادلانه أو يعبث به، ومنه ما يكتبه في النماذج.
- ميزات كثيرة في المتصفح لا تعمل إلا في سياق آمن، كصفحة HTTPS، منها تحديد الموقع الجغرافي، والإشعارات، وواجهة طلبات الدفع (Payment Request).
- يوصي Google بشدة باستخدام HTTPS، ويفضّل فهرسة نسخة HTTPS من الصفحة، إلا إن وجد مشكلات مثل شهادة غير صالحة أو تحويل إلى HTTP.
- إن كانت كل لغة على نطاق فرعي، مثل `ar.example.com` و`en.example.com`، فيجب أن تطابق الشهادة كل اسم منهما، بشهادة لكل نطاق أو بشهادة wildcard.

## مثال

التحقق من أن الموقع يحوّل HTTP إلى HTTPS بتحويل دائم:

```text
$ curl -I http://example.com/ar/
HTTP/1.1 301 Moved Permanently
Location: https://example.com/ar/
```

ثم تأكد أن الرابط الأساسي وخريطة الموقع وروابط `hreflang` كلها تستخدم `https://`.

## أخطاء شائعة

- شهادة منتهية أو لا تطابق الاسم، كأن تغطي `www.example.com` دون `example.com`: يوقف المتصفح الاتصال أو يحذّر الزائر، وتقول Search Console إنها تصيب الموقع كله في العادة.
- سكربت يُحمَّل عبر `http://` في صفحة HTTPS: هذا محتوى مختلط (mixed content) يحظره المتصفح. أما الصور فقد يحوّلها المتصفح إلى `https` أو يحظرها.
- صفحة HTTPS تحوّل إلى HTTP، أو رابط أساسي أو خريطة موقع تشير إلى HTTP.
- منع نسخة HTTPS من الزحف في robots.txt.

## المراجع

- [MDN: HTTPS](https://developer.mozilla.org/en-US/docs/Glossary/HTTPS) (بالإنجليزية)
- [RFC 9110: دلالات HTTP، مخطط https](https://www.rfc-editor.org/rfc/rfc9110.html#name-https-uri-scheme) (بالإنجليزية)
- [W3C: المحتوى المختلط](https://www.w3.org/TR/mixed-content/) (بالإنجليزية)
- [MDN: الميزات المقصورة على السياقات الآمنة](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts/features_restricted_to_secure_contexts) (بالإنجليزية)
- [مساعدة Search Console: تقرير HTTPS](https://support.google.com/webmasters/answer/11396518?hl=ar)
- [Google Search Central: طريقة تحديد عنوان URL الأساسي](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls?hl=ar)
