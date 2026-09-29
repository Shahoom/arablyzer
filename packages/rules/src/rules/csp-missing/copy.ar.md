---
reviewed: false
---

# صفحة بلا سياسة أمان المحتوى (CSP)

## الرسائل

### missing

لا ترسل الصفحة الترويسة `Content-Security-Policy`، وليس في `<head>` وسم `<meta http-equiv="Content-Security-Policy">`، فلا شيء يخبر المتصفح بالسكربتات والموارد الأخرى التي يحق للصفحة تحميلها.

### report-only

في الصفحة الترويسة `Content-Security-Policy-Report-Only` وحدها، وهي تُبلغ بما كانت سياستها ستمنعه، لكنها لا تمنع شيئاً.

### meta-ignored

المتصفح يتجاهل هذا الوسم `<meta http-equiv="Content-Security-Policy">`: فهو لا يقرؤه إلا داخل `<head>`، ولا يقرأ منه أبداً `frame-ancestors` ولا `report-uri` ولا `sandbox`.

## لماذا يهم

- سياسة أمان المحتوى (CSP) تخبر المتصفح من أين يحق للصفحة أن تحمّل السكربتات وملفات CSS والصور وغيرها، فيرفض المتصفح ما سواها. وأهم ما تحمي منه هجمات حقن السكربتات (XSS): السكربت الذي يدسّه أحدهم في الصفحة، عبر تعليق أو حقل بحث، لا يعمل إذا لم تسمح به السياسة.
- بلا سياسة، يشغّل المتصفح كل سكربت يصل إلى الصفحة.
- وتعدّها OWASP طبقة فوق وسائل الحماية الأخرى لا بديلاً عنها: فالصفحة تبقى مطالَبة بترميز ما يكتبه الزوار قبل عرضه.
- أما الترويسة `Content-Security-Policy-Report-Only` فلتجربة السياسة: يبلّغ المتصفح بما كان سيمنعه، ولا يمنع شيئاً.

## كيف تُصلح

أرسل سياسة تناسب ما تحمّله صفحاتك فعلاً. السياسة الأساسية التي تقترحها OWASP تناسب موقعاً كل موارده من نطاقه نفسه، وليس في صفحاته كود مضمّن:

```http
Content-Security-Policy: default-src 'self'; frame-ancestors 'self'; form-action 'self'
```

- **Apache** (الوحدة mod_headers): `Header always set Content-Security-Policy "default-src 'self'; frame-ancestors 'self'; form-action 'self'"`
- **nginx**: `add_header Content-Security-Policy "default-src 'self'; frame-ancestors 'self'; form-action 'self'" always;`
- وفي nginx لا ترث الكتلة `location` التي فيها `add_header` خاص بها ترويسات الكتلة `server`، فكرّر الترويسة فيها.
- **Cloudflare**: قاعدة من نوع Response Header Transform Rule تضبط الترويسة.
- إن لم تصل إلى إعدادات الخادم فضع السياسة في وسم `<meta http-equiv="Content-Security-Policy">` في أول `<head>`. لكنها لا تشمل إلا ما يأتي بعده، ولا تضبط `frame-ancestors` ولا `report-uri` ولا `sandbox`.
- الصفحة التي تحمّل سكربتات من مواقع أخرى، أو فيها سكربتات مضمّنة، تحتاج سياسة تذكر هذه المصادر: أرسلها أولاً في `Content-Security-Policy-Report-Only`، واقرأ ما كانت ستمنعه، ثم أرسلها في `Content-Security-Policy`.

## كيف نكشف

1. تنطبق القاعدة على صفحات HTML التي ترد بحالة 2xx على موقع عام. ونستثني عناوين التطوير المحلية، مثل `localhost` والعناوين الخاصة والأسماء المنتهية بـ `.test`، كما تفعل قاعدة HTTPS: فالسياسة تحمي زوار الموقع العام.
2. نقرأ ترويسات `Content-Security-Policy` كما يقرؤها المتصفح (المستوى الثالث من CSP): قد تحمل الترويسة الواحدة أكثر من سياسة تفصل بينها فواصل، وتُحسب السياسة إذا كان فيها توجيه واحد على الأقل، ونقرأ أسماء التوجيهات بأي حالة أحرف، ونتخطى التوجيه الذي فيه حروف غير ASCII.
3. ويُحسب وسم `<meta http-equiv="Content-Security-Policy">` داخل `<head>`، بعد حذف `frame-ancestors` و`report-uri` و`sandbox`، لأن المتصفح يحذفها من الوسم.
4. لا تُحسب ترويسة `Content-Security-Policy-Report-Only`، لأنها لا تمنع شيئاً.
5. نتحقق من وجود سياسة مفروضة، لا مما تسمح به: السياسة المتساهلة تنجح في هذه القاعدة.

## المراجع

- [MDN: الترويسة Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy) (بالإنجليزية)
- [W3C: سياسة أمان المحتوى، المستوى الثالث](https://www.w3.org/TR/CSP3/) (بالإنجليزية)
- [OWASP: دليل سياسة أمان المحتوى](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html) (بالإنجليزية)
