---
reviewed: false
summary: هل ترسل صفحتك الترويسات التي تحمي زوارها في المتصفح؟
---

# فحص ترويسات الأمان

يتحقق من ترويسات الأمان التي ترسلها صفحتك: HSTS، وسياسة أمان المحتوى، وX-Content-Type-Options، والحماية من عرضها داخل إطار، وسياسة المُحيل، كما يقرؤها المتصفح.

## ماذا تفحص

- الترويسة `Strict-Transport-Security` (HSTS) في صفحة HTTPS، بقيمة `max-age` أكبر من صفر ومكتوبة كما يطلب المعيار RFC 6797، ليبقى المتصفح على HTTPS.
- سياسة أمان محتوى مفروضة، في ترويسة `Content-Security-Policy` أو في وسم `<meta http-equiv>` داخل `<head>`. أما ترويسة `Content-Security-Policy-Report-Only` فلا تمنع شيئاً، فلا تُحسب.
- الترويسة `X-Content-Type-Options: nosniff`، ليأخذ المتصفح `Content-Type` كل استجابة كما أُرسلت بدل أن يخمّنه.
- الحماية من عرض الصفحة داخل إطار، ضد «اختطاف النقرات»: التوجيه `frame-ancestors` في ترويسة السياسة، أو `X-Frame-Options` بقيمة `DENY` أو `SAMEORIGIN`.
- سياسة للمُحيل، في ترويسة `Referrer-Policy` أو في وسم `<meta name="referrer">`. وهذه معلومة فقط: فالمتصفحات تستخدم افتراضياً `strict-origin-when-cross-origin`.

## مثال

### خطأ

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
X-Frame-Options: ALLOW-FROM https://partner.example/
```

### صحيح

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; frame-ancestors 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
```

## كيف تُصلح

أضف الترويسات حيث يكتب خادمك استجاباته. في nginx، داخل كتلة `server` لموقعك على HTTPS:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'; frame-ancestors 'self'" always;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options SAMEORIGIN always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
```

- في nginx لا ترث الكتلة `location` التي فيها `add_header` خاص بها ترويسات الكتلة `server`، فكرّرها فيها.
- وفي Apache (الوحدة mod_headers) كل ترويسة سطر `Header always set`، مثل `Header always set X-Content-Type-Options "nosniff"`.
- وفي Cloudflare تستطيع قاعدة من نوع Response Header Transform Rule أن تضبط كلاً منها.
- اكتب السياسة لما تحمّله صفحاتك: `default-src 'self'` تناسب موقعاً كل ملفاته من نطاقه نفسه، وليس فيه كود مضمّن في الصفحة. وجرّب سياستك أولاً في `Content-Security-Policy-Report-Only`، واقرأ ما كانت ستمنعه.
- الخيار `includeSubDomains` يشمل كل النطاقات الفرعية: أبقِه إذا كانت كلها تعمل عبر HTTPS، أو ابدأ دونه.

## أسئلة شائعة

### هل أستطيع وضع هذه الترويسات في وسم `<meta>` بدلاً منها؟

اثنتان منها فقط. سياسة أمان المحتوى تعمل في `<meta http-equiv="Content-Security-Policy">` داخل `<head>`، دون `frame-ancestors` و`report-uri` و`sandbox`، وسياسة المُحيل تعمل في `<meta name="referrer">`. أما HSTS و`X-Content-Type-Options` و`X-Frame-Options` فلا يقرؤها المتصفح إلا من ترويسات الاستجابة.

### لماذا لا تُخصم سياسة المُحيل من الدرجة؟

لأن المتصفحات تستخدم `strict-origin-when-cross-origin` إذا لم تحدد الصفحة سياسة، وهي لا ترسل إلى المواقع الأخرى إلا الأصل. ويذكرها الفحص معلومةً لتحدد السياسة بنفسك، فقبل تعديل المعيار في نوفمبر 2020 كانت السياسة الافتراضية ترسل العنوان كاملاً إلى المواقع الأخرى.

### هل يعني النجاح أن ترويساتي صارمة بما يكفي؟

لا. يجد الفحص كل ترويسة ويقرؤها كما يقرؤها المتصفح، لكنه لا يحكم على ما تسمح به سياسة أمان المحتوى، ولا على المواقع التي يسمح لها `frame-ancestors` بعرض الصفحة. فالسياسة `default-src *` تنجح، وحمايتها قليلة.

### هل تفحص الأداة ترويسات السكربتات وملفات CSS؟

لا، فهي تقرأ استجابة الصفحة نفسها. أرسل الترويسات نفسها في كل الاستجابات: فالترويسة `X-Content-Type-Options` مهمة كذلك في السكربتات وملفات CSS، التي يرفضها المتصفح معها إذا كان `Content-Type` فيها خاطئاً.

## المنهجية

نجلب الصفحة باسم `ArablyzerBot`، ونتبع تحويلاتها، ونقرأ ترويسات الاستجابة الأخيرة وHTML كما يرسلها الخادم، قبل تشغيل JavaScript. ونقرأ كل ترويسة كما يقرؤها المتصفح: السياسة كما يقرؤها المستوى الثالث من معيار سياسة أمان المحتوى، و`X-Content-Type-Options` بقيمتها الأولى كما يقول معيار Fetch، و`X-Frame-Options` كما يقول معيار HTML، و`Referrer-Policy` بآخر قيمة يعرفها المتصفح، و`Strict-Transport-Security` كما يكتبها المعيار RFC 6797. تنطبق الفحوص على صفحات HTML التي ترد بحالة 2xx على موقع عام، وHSTS على صفحات HTTPS على اسم نطاق. وسياسة المُحيل معلومة لا تُخصم من الدرجة. تعطي الصفحة نفسها النتيجة نفسها في كل فحص.
