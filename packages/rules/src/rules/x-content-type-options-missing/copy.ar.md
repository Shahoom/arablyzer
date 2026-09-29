---
reviewed: false
---

# صفحة بلا X-Content-Type-Options: nosniff

## الرسائل

### missing

لا ترسل الصفحة الترويسة `X-Content-Type-Options: nosniff`، فقد يخمّن المتصفح نوع الاستجابة من محتواها بدل ترويسة `Content-Type`.

### invalid

القيمة الأولى في الترويسة `X-Content-Type-Options` هي `{value}` لا `nosniff`، فيتجاهلها المتصفح.

## لماذا يهم

- دون هذه الترويسة قد يفحص المتصفح محتوى الاستجابة ليخمّن نوعها بدل أن يثق بترويسة `Content-Type`، وهذا ما يسمى تخمين نوع MIME.
- ومع `X-Content-Type-Options: nosniff` يأخذ المتصفح `Content-Type` كما أُرسلت. ومثال MDN: استجابة من نوع `text/plain` فيها وسوم HTML لا يقرؤها المتصفح على أنها HTML.
- ويرفض المتصفح أيضاً ملف CSS نوعه غير `text/css`، وسكربتاً نوعه ليس من أنواع JavaScript: فالملف الذي يُرسَل من موقعك نصاً، كملف رفعه أحد الزوار، لا يُحمَّل سكربتاً.
- وتوصي OWASP بهذه الترويسة، مع ترويسة `Content-Type` صحيحة في كل الموقع.

## كيف تُصلح

أرسل الترويسة في كل الاستجابات:

```http
X-Content-Type-Options: nosniff
```

- **Apache** (الوحدة mod_headers): `Header always set X-Content-Type-Options "nosniff"`
- **nginx**: `add_header X-Content-Type-Options nosniff always;`
- وفي nginx لا ترث الكتلة `location` التي فيها `add_header` خاص بها ترويسات الكتلة `server`، فكرّر الترويسة فيها.
- **Cloudflare**: قاعدة من نوع Response Header Transform Rule تضبط الترويسة.
- وتحقق من `Content-Type` كل ملف أيضاً: `text/css` لملفات CSS، و`text/javascript` للسكربتات. فمع هذه الترويسة يرفض المتصفح ملف CSS أو سكربتاً أُرسل بنوع آخر.

## كيف نكشف

1. تنطبق القاعدة على صفحات HTML التي ترد بحالة 2xx على موقع عام. ونستثني عناوين التطوير المحلية، مثل `localhost` والعناوين الخاصة والأسماء المنتهية بـ `.test`، كما تفعل قاعدة HTTPS: فالترويسة تحمي زوار الموقع العام.
2. نقرأ ترويسات `X-Content-Type-Options` كما يقرؤها المتصفح (خطوة «determine nosniff» في معيار Fetch): كلها قائمة واحدة تُقسم عند الفواصل، ويجب أن تكون القيمة الأولى `nosniff`، بأي حالة أحرف. وأي قيمة أولى غيرها يتجاهلها المتصفح.
3. نقرأ استجابة الصفحة نفسها. والترويسة مهمة كذلك في السكربتات وملفات CSS، وهذه القاعدة لا تجلبها.

## المراجع

- [MDN: الترويسة X-Content-Type-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options) (بالإنجليزية)
- [WHATWG Fetch: الترويسة X-Content-Type-Options](https://fetch.spec.whatwg.org/#x-content-type-options-header) (بالإنجليزية)
- [OWASP: دليل ترويسات الأمان في HTTP](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) (بالإنجليزية)
