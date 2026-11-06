---
title: "ترويسات الأمان للمواقع: CSP وHSTS وX-Frame-Options وReferrer-Policy"
description: "ما الترويسات التي يحمي بها خادمك زوار موقعك: سياسة أمان المحتوى وHSTS والحماية من الإطارات وnosniff وسياسة المُحيل، مع أمثلة جاهزة تناسب Apache وnginx وCloudflare."
summary: "خمس ترويسات تطلب من المتصفح حماية زوارك، وطريقة إضافتها دون كسر موقعك."
date: "2026-11-06"
tags: ["security"]
lang: ar
draft: false
reviewed: false
tools: [security-headers, tls-check]
rules: [csp-missing, frame-protection-missing, referrer-policy-missing, x-content-type-options-missing, hsts-missing, https-missing]
fix: []
terms: [hsts, https, mixed-content, content-security-policy]
related: [email-authentication-spf-dmarc]
---

كل صفحة يفتحها زائر تصله من خادمك ومعها **ترويسات**: أسطر تسبق الصفحة نفسها وتصف الاستجابة للمتصفح. وبين هذه الترويسات خمس تطلب منه أن يحمي زائرك: ألا يشغّل سكربتاً دسّه أحدهم في الصفحة، وألا يعرضها داخل إطار في موقع آخر، وألا يخمّن نوع الملف، وألا يرسل عنوان صفحتك أكثر مما يلزم، وألا يفتح الموقع إلا عبر HTTPS.

لا تجعل هذه الترويسات الموقع محصّناً، ولا تغني عن تحديث الإضافات وكلمات المرور القوية. لكنها أسطر قليلة في إعداد الخادم تغلق أبواباً معروفة، وينفذها متصفح كل زائر. نشرح هنا ما تفعله كل واحدة وما لا تفعله، وكيف تضيفها في Apache وnginx وCloudflare، وكيف تجرّب سياسة المحتوى دون أن تكسر موقعك.

## الترويسات الخمس في نظرة {#overview}

| الترويسة | ما تطلبه من المتصفح | القاعدة |
| --- | --- | --- |
| `Strict-Transport-Security` | ألا يفتح الموقع إلا عبر HTTPS | [hsts-missing](/rules/hsts-missing) |
| `Content-Security-Policy` | ألا يحمّل إلا الموارد التي سمّيتها | [csp-missing](/rules/csp-missing) |
| `frame-ancestors` أو `X-Frame-Options` | ألا يعرض الصفحة داخل إطار في موقع آخر | [frame-protection-missing](/rules/frame-protection-missing) |
| `X-Content-Type-Options` | ألا يخمّن نوع الملف | [x-content-type-options-missing](/rules/x-content-type-options-missing) |
| `Referrer-Policy` | أن يقيّد ما يرسله عن الصفحة السابقة | [referrer-policy-missing](/rules/referrer-policy-missing) |

يقرأ المتصفح هذه الترويسات من استجابة الخادم، فمكانها إعداد الخادم أو شبكة التوصيل. وتقبل سياسة المحتوى وسياسة المُحيل وسماً `<meta>` بديلاً إن لم تصل إلى الخادم، وسياسة المحتوى في الوسم دون `frame-ancestors` و`report-uri` و`sandbox`، أما `Strict-Transport-Security` و`X-Content-Type-Options` و`X-Frame-Options` فلا يقرؤها المتصفح من `<meta>` أبداً. ويقرأ [فاحص ترويسات الأمان](/tools/security-headers) كل واحدة منها كما يقرؤها المتصفح، في صفحات HTML التي ترد بحالة 2xx على موقع عام.

## أولاً: HTTPS ثم HSTS {#https}

لا قيمة لبقية الترويسات في صفحة تُحمَّل عبر HTTP، فمن في الطريق بين الزائر والموقع يستطيع أن يقرأها ويغيّرها ([https-missing](/rules/https-missing)). ثبّت شهادة TLS، وحوّل كل طلب HTTP إلى HTTPS بتحويل دائم (301)، ثم أضف HSTS:

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

تخبر هذه الترويسة المتصفح أن يستخدم HTTPS وحده لهذا الموقع مدة `max-age` بالثواني، والرقم أعلاه سنة. وتُكتب الترويسة كما يحدد المعيار [RFC 6797](https://www.rfc-editor.org/rfc/rfc6797). أضف `includeSubDomains` بعد أن تتأكد أن نطاقاتك الفرعية كلها تعمل على HTTPS. وتحذّر [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) من أن خطأ في الترويسة أو في الشهادة قد يحجب زواراً مشروعين طوال مدة `max-age`، فابدأ بمدة قصيرة وزدها.

وإن حمّلت صفحة HTTPS صورة أو سكربتاً عبر HTTP فهذا [محتوى مختلط](/glossary/mixed-content) يُضعف الحماية. اقرأ عن [HSTS](/glossary/hsts) و[HTTPS](/glossary/https)، وراجع [قاعدة hsts-missing](/rules/hsts-missing). أما [فاحص الشهادة وHTTPS](/tools/tls-check) فيقرأ عنوان الصفحة النهائي وتاريخ انتهاء الشهادة وHSTS معاً.

## سياسة أمان المحتوى (CSP) {#csp}

تخبر `Content-Security-Policy` المتصفح من أين يحق للصفحة أن تحمّل السكربتات وملفات CSS والصور وغيرها، فيرفض ما سواها. وتقول [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP) إنها تُستعمل أساساً دفاعاً ضد هجمات حقن السكربتات (XSS): السكربت الذي يدسّه أحدهم عبر تعليق أو حقل بحث لا يعمل إن لم تسمح به السياسة. لكنها طبقة فوق غيرها لا بديل منها: تقول [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html) إنه لا ينبغي أن تكون الدفاع الوحيد، فتبقى مطالباً بترميز ما يكتبه الزوار قبل عرضه. وهذه السياسة الأساسية التي تقترحها OWASP:

```http
Content-Security-Policy: default-src 'self'; frame-ancestors 'self'; form-action 'self'
```

`default-src 'self'` تجعل كل المصادر من نطاقك ما لم تُذكر غير ذلك، و`frame-ancestors 'self'` تمنع عرض صفحتك في إطار خارجي، و`form-action 'self'` تقصر إرسال النماذج على موقعك. وهي تناسب موقعاً كل موارده من نطاقه وليس في صفحاته كود مضمّن. فإن كان في موقعك أداة تحليلات أو خطوط أو خريطة من موقع آخر، أو سكربت مضمّن في القالب، فالسياسة أعلاه ستمنعها: تقول MDN إن السياسة التي فيها `default-src` أو `script-src` لا تسمح بتشغيل JavaScript المضمّن إلا بإجراء إضافي، مثل nonce أو hash، وتنصح بتجنب `'unsafe-inline'`.

وانتبه إلى حدّ الفحص: يتحقق [csp-missing](/rules/csp-missing) من وجود سياسة مفروضة لا من إحكامها، فالسياسة `default-src *` تنجح فيه وحمايتها قليلة. ولا يحسب الترويسة `Content-Security-Policy-Report-Only` لأنها لا تمنع شيئاً.

## جرّب السياسة أولاً في وضع Report-Only {#report-only}

الترويسة `Content-Security-Policy-Report-Only` تُبقي السياسة غير مفروضة، لكن المتصفح يبلّغ بكل ما كانت ستمنعه ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)). وهي تعمل من ترويسة الاستجابة فقط، لا من وسم `<meta>`. والخطوات:

1. أرسل سياستك في `Content-Security-Policy-Report-Only`، مع عنوان يستقبل التقارير.
2. اقرأ التقارير. تصل بطلب POST، وتنصح MDN بذكر `report-uri` أيضاً إلى أن تدعم كل المتصفحات `report-to`.
3. أضف إلى السياسة المصادر المشروعة التي ظهرت في التقارير، واحداً واحداً.
4. حين تخلو التقارير من موارد تريدها، أرسل السياسة نفسها في `Content-Security-Policy` لتُفرض، وأبقِ مراقبة موقعك.

هكذا تبدو الخطوة الأولى، بالصيغة التي تشرحها MDN:

```http
Reporting-Endpoints: csp-endpoint="https://example.com/csp-reports"
Content-Security-Policy-Report-Only: default-src 'self'; report-to csp-endpoint
```

وهكذا بعد أن أضفت مصدرين شرعيين ظهرا في التقارير، وهما هنا مثالان:

```http
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://stats.example; img-src 'self' https://cdn.example
```

## الحماية من الإطارات {#frames}

في هجوم «اختطاف النقرات» (clickjacking) يحمّل موقع آخر صفحتك في إطار يخفيه فوق محتواه، فيظن الزائر أنه ينقر في ذلك الموقع وهو ينقر زراً في صفحتك، كزر شراء أو حذف. والعلاج أن تسمّي من يحق له عرض صفحتك:

```http
Content-Security-Policy: frame-ancestors 'self'
X-Frame-Options: SAMEORIGIN
```

التوجيه `frame-ancestors` يحل محل `X-Frame-Options` في المتصفحات التي تفهمه، وتنصح OWASP بإرسال الاثنتين. استخدم `'none'` و`DENY` إن كانت الصفحة لا تُعرض في إطار أبداً. أما القيمة `ALLOW-FROM` فتقول MDN إنها مهجورة وإن المتصفحات الحديثة تتجاهل الترويسة معها كلها. وإن كانت صفحة معدّة للتضمين في موقع شريك فسمِّه: `frame-ancestors https://partner.example`. ولا تعمل أي منهما من `<meta>`. وأثناء تجربة السياسة في Report-Only أبقِ `X-Frame-Options` مفروضة، فسياسة الإبلاغ لا تمنع شيئاً. التفاصيل في [قاعدة frame-protection-missing](/rules/frame-protection-missing).

## nosniff وسياسة المُحيل {#small}

**`X-Content-Type-Options: nosniff`.** من دونها قد يفحص المتصفح محتوى الاستجابة ليخمّن نوعها بدل أن يثق بترويسة `Content-Type`. ومعها يأخذ النوع كما أُرسل: تقول [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options) إن استجابة `text/plain` فيها وسوم HTML لا يقرؤها المتصفح على أنها HTML، وإنه يرفض ملف CSS نوعه ليس `text/css` وسكربتاً نوعه ليس من أنواع JavaScript. فتأكد أن خادمك يرسل `Content-Type` الصحيح لكل ملف، وإلا كسرت الترويسة ملفاً أُرسل بنوع خاطئ ([x-content-type-options-missing](/rules/x-content-type-options-missing)).

**`Referrer-Policy`.** حين يتبع الزائر رابطاً من صفحتك يرسل المتصفح ترويسة `Referer` فيها عنوانها. والافتراضي في المتصفحات الحالية `strict-origin-when-cross-origin`: العنوان كاملاً داخل موقعك، والأصل وحده إلى مواقع أخرى، ولا شيء من HTTPS إلى HTTP ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy)). لذلك لا تُخصم [referrer-policy-missing](/rules/referrer-policy-missing) من الدرجة، وتوصي OWASP بأن تعلن السياسة صراحةً بدل الاعتماد على الافتراضي. وإن حملت عناوينك بيانات خاصة فاختر `same-origin` أو `no-referrer`.

## أمثلة جاهزة للنسخ {#configs}

القيمة الأولى لسياسة المحتوى هنا في وضع الإبلاغ، فغيّر اسمها إلى `Content-Security-Policy` بعد التجربة. أرسل HSTS في ردود HTTPS فقط.

**Apache** (الوحدة mod_headers):

```apache
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header always set Content-Security-Policy-Report-Only "default-src 'self'; frame-ancestors 'self'; form-action 'self'"
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "SAMEORIGIN"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
```

**nginx**، داخل كتلة `server` لموقع HTTPS:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy-Report-Only "default-src 'self'; frame-ancestors 'self'; form-action 'self'" always;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options SAMEORIGIN always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
```

في nginx لا ترث الكتلة `location` التي فيها `add_header` خاص بها ترويسات كتلة `server`، فكرّر الترويسات فيها.

**Cloudflare:** من صفحة Rules ثم Overview اختر Create rule ثم Response Header Transform Rule، وفي Modify response header اختر Set static، واكتب اسم الترويسة وقيمتها، ثم Deploy ([التوثيق](https://developers.cloudflare.com/rules/transform/response-header-modification/create-dashboard/)). وتتسع القاعدة الواحدة لعدة ترويسات. وللتحويل المُدار Add security headers قيم غير قيم هذا المقال، كسياسة المُحيل `same-origin`، فاقرأ قيمه قبل أن تفعّله.

## كيف تتحقق {#verify}

1. اطلب صفحتك وانظر الترويسات: `curl -s -D - -o /dev/null https://example.com/`.
2. شغّل [فاحص ترويسات الأمان](/tools/security-headers) على الصفحة الرئيسية وصفحة منتج وصفحة فيها نموذج، فقد تفقد إحدى كتل `location` الترويسات.
3. افتح موقعك وجرّب ما يحمّل من موقع آخر: خريطة، أو فيديو مضمّن، أو أداة تحليلات، أو زر محادثة.
4. أعد الفحص بعد كل تغيير في الخادم أو الشبكة. ولاحظ أن الفاحص يقرأ استجابة الصفحة نفسها، لا ملفات السكربت وCSS، وفيهما تهم `Content-Type`.

## قائمة قبل أن تنشر {#checklist}

- الموقع على HTTPS، وكل طلب HTTP يتحول بتحويل 301.
- HSTS في ردود HTTPS، وبمدة بدأت قصيرة.
- سياسة المحتوى جُرّبت في Report-Only وقُرئت تقاريرها قبل أن تُفرض.
- `frame-ancestors` أو `X-Frame-Options` مفروضة.
- `X-Content-Type-Options: nosniff` مع `Content-Type` صحيح لكل ملف.
- سياسة المُحيل معلنة صراحةً.
- الترويسات في كل كتلة `location` وكل مسار.
- فحص جديد بعد كل تغيير.
