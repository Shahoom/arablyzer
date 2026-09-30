---
reviewed: false
---

# صفحة بلا سياسة للمُحيل (Referrer-Policy)

## الرسائل

### missing

لا تحدد الصفحة سياسة للمُحيل، لا في ترويسة `Referrer-Policy` ولا في وسم `<meta name="referrer">`، فيستخدم المتصفح سياسته الافتراضية `strict-origin-when-cross-origin`.

### invalid

القيمة `{value}` ليست سياسة مُحيل يعرفها المتصفح، فيستخدم سياسته الافتراضية `strict-origin-when-cross-origin`.

## لماذا يهم

- حين يتبع الزائر رابطاً، أو تحمّل الصفحة ملفاً من موقع آخر، يرسل المتصفح ترويسة `Referer` فيها عنوان الصفحة التي جاء منها. وقد يقول العنوان أكثر مما ينبغي: وتحذّر MDN من العناوين الداخلية، ومن معاملات فيها بيانات خاصة.
- سياسة المُحيل تحدد كم يُرسَل من العنوان. والمتصفحات الحالية تستخدم افتراضياً `strict-origin-when-cross-origin`: العنوان كاملاً داخل موقعك، والأصل وحده إلى المواقع الأخرى، ولا شيء من HTTPS إلى HTTP. ولهذا فالقاعدة معلومة، ولا تُخصم من الدرجة.
- وقبل تعديل المعيار في نوفمبر 2020 كانت السياسة الافتراضية `no-referrer-when-downgrade`، التي ترسل العنوان كاملاً إلى المواقع الأخرى. وتحديد السياسة يشمل المتصفحات الأقدم من هذا التعديل، ويجعلها اختياراً معلناً.

## كيف تُصلح

أرسل السياسة التي توصي بها OWASP، وهي افتراضية المتصفحات أيضاً:

```http
Referrer-Policy: strict-origin-when-cross-origin
```

- **Apache** (الوحدة mod_headers): `Header always set Referrer-Policy "strict-origin-when-cross-origin"`
- **nginx**: `add_header Referrer-Policy strict-origin-when-cross-origin always;`
- **Cloudflare**: قاعدة من نوع Response Header Transform Rule تضبط الترويسة.
- إن لم تصل إلى إعدادات الخادم فضعها في `<head>`: `<meta name="referrer" content="strict-origin-when-cross-origin" />`، بقيمة واحدة.
- وإذا كانت عناوينك تحمل بيانات خاصة فاختر سياسة أشد: `same-origin` لا ترسل شيئاً إلى المواقع الأخرى، و`no-referrer` لا ترسل شيئاً أبداً.

## كيف نكشف

1. تنطبق القاعدة على صفحات HTML التي ترد بحالة 2xx على موقع عام. ونستثني عناوين التطوير المحلية، مثل `localhost` والعناوين الخاصة والأسماء التي آخرها `.test`، كما تفعل قاعدة HTTPS.
2. نقرأ ترويسات `Referrer-Policy` كما يقرؤها المتصفح: قيمها مقسومة عند الفواصل، وتفوز آخر قيمة يعرفها المتصفح، ليستطيع الموقع أن يجعل لسياسة جديدة بديلاً أقدم منها. والقيمة التي فيها غير الحروف والشرطات تجعل الترويسة كلها غير صالحة. ونقرأ السياسات بأي حالة أحرف، كما يقرؤها Chromium.
3. ويُحسب وسم `<meta name="referrer">` في أي مكان من الصفحة، بقيمة واحدة بأي حالة أحرف، ومنها القيم القديمة التي ما زال معيار HTML يقبلها: `never` و`default` و`always` و`origin-when-crossorigin`.
4. أما السمة `referrerpolicy`، أو `rel="noreferrer"`، فتحدد سياسة رابط واحد أو ملف واحد، لا سياسة الصفحة، فلا تُحسب.
5. النتيجة معلومة: لا تُخصم من الدرجة أبداً.

## المراجع

- [MDN: الترويسة Referrer-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy) (بالإنجليزية)
- [MDN: إعداد سياسة المُحيل](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Referrer_policy) (بالإنجليزية)
- [W3C: سياسة المُحيل](https://w3c.github.io/webappsec-referrer-policy/) (بالإنجليزية)
- [OWASP: دليل ترويسات الأمان في HTTP](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) (بالإنجليزية)
