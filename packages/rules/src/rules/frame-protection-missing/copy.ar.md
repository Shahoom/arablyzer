---
reviewed: false
---

# أي موقع يستطيع عرض الصفحة داخل إطار

## الرسائل

### missing

لا شيء يمنع المواقع الأخرى من عرض هذه الصفحة داخل إطار: فلا توجيه `frame-ancestors` في ترويسة `Content-Security-Policy`، ولا ترويسة `X-Frame-Options` بقيمة `DENY` أو `SAMEORIGIN`.

### x-frame-options-ignored

المتصفح يتجاهل الترويسة `X-Frame-Options` بهذه القيمة (`{value}`): فلا يمنع عرض الصفحة في إطارات المواقع الأخرى إلا `DENY` و`SAMEORIGIN`، أما `ALLOW-FROM` فقيمة مهجورة.

### meta

هذا الوسم `<meta>` لا يمنع عرض الصفحة داخل إطار: فالمتصفح لا يقرأ `frame-ancestors` ولا `X-Frame-Options` إلا من ترويسات الاستجابة.

## لماذا يهم

- الصفحة التي يستطيع أي موقع عرضها في إطار معرّضة لهجوم «اختطاف النقرات» (clickjacking): يحمّلها موقع آخر في إطار يخفيه فوق محتواه، فيظن الزائر أنه ينقر في ذلك الموقع وهو ينقر زراً في صفحتك، كزر شراء أو حذف أو مشاركة.
- التوجيه `frame-ancestors` في ترويسة `Content-Security-Policy` يحدد المواقع التي يحق لها عرض الصفحة في إطار: `'none'` لا أحد، و`'self'` موقعك وحده. وهو يحل محل `X-Frame-Options`: إذا جاءت الاثنتان في استجابة واحدة تجاهل المتصفح `X-Frame-Options`.
- والترويسة `X-Frame-Options` تفعل الشيء نفسه بالقيمة `DENY` أو `SAMEORIGIN`. أما صيغتها `ALLOW-FROM` فمهجورة، ويتجاهلها المتصفح.
- ولا تعمل أي منهما من وسم `<meta>`: فالمتصفح يقرؤهما من ترويسات الاستجابة وحدها.

## كيف تُصلح

أرسل `frame-ancestors` في ترويسة السياسة، ومعها `X-Frame-Options` للمتصفحات القديمة، كما تنصح OWASP:

```http
Content-Security-Policy: frame-ancestors 'self'
X-Frame-Options: SAMEORIGIN
```

- **Apache** (الوحدة mod_headers): `Header always set X-Frame-Options "SAMEORIGIN"`، ومعها `frame-ancestors 'self'` في سياسة `Content-Security-Policy`.
- **nginx**: `add_header X-Frame-Options SAMEORIGIN always;`
- وفي nginx أضف التوجيه إلى ترويسة السياسة أيضاً. والكتلة `location` التي فيها `add_header` خاص بها لا ترث ترويسات الكتلة `server`، فكرّرها فيها.
- **Cloudflare**: قاعدة من نوع Response Header Transform Rule تضبط الترويستين.
- إذا كانت للصفحة سياسة `Content-Security-Policy` فأضف التوجيه إليها، أو أرسل سياسة ثانية فيها التوجيه وحده: فالمتصفح يفرض كل سياسة تصله.
- استخدم `'none'` و`DENY` إذا كانت الصفحة لا تُعرض في إطار أبداً، ولو في موقعك. أما الصفحة المعدّة لمواقع أخرى، كأداة تُضمَّن فيها، فتسمّي تلك المواقع: `frame-ancestors https://partner.example`.

## كيف نكشف

1. تنطبق القاعدة على صفحات HTML التي ترد بحالة 2xx على موقع عام. ونستثني عناوين التطوير المحلية، مثل `localhost` والعناوين الخاصة والأسماء المنتهية بـ `.test`، كما تفعل قاعدة HTTPS: فهذه الترويسات تحمي زوار الموقع العام.
2. تنجح الصفحة إذا كان فيها التوجيه `frame-ancestors`، أياً كانت المواقع التي يسمح بها، في ترويسة `Content-Security-Policy`، نقرؤها كما يقرأ المتصفح السياسة. ولا تُحسب ترويسة `Content-Security-Policy-Report-Only`، ولا وسم `<meta>`.
3. وإلا قرأنا `X-Frame-Options` كما يقول معيار HTML: كل قيمها، مقسومة عند الفواصل، بأحرف صغيرة. تنجح القيمة الوحيدة `DENY` أو `SAMEORIGIN`. والقيم المختلفة التي بينها `DENY` أو `SAMEORIGIN` أو `ALLOWALL` تجعل المتصفح يرفض كل إطار، فتنجح أيضاً. وأي قيمة أخرى، ومنها `ALLOW-FROM`، يتجاهلها المتصفح.
4. ونذكر في النتائج كل وسم `<meta>` يحاول أياً منهما.

## المراجع

- [MDN: الترويسة X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options) (بالإنجليزية)
- [MDN: التوجيه frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors) (بالإنجليزية)
- [معيار HTML: الترويسة X-Frame-Options](https://html.spec.whatwg.org/#the-x-frame-options-header) (بالإنجليزية)
- [OWASP: دليل الحماية من اختطاف النقرات](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html) (بالإنجليزية)
