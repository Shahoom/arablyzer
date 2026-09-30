---
reviewed: false
---

# نصوص تُرسَل دون ضغط

## الرسائل

### uncompressed

يُرسَل {url} دون ضغط ({size} KB). مضغوطاً بـ gzip يصير {gzipped} KB، فيوفّر {saved} KB على كل زائر.

## لماذا يهم

- ملفات HTML وCSS وJavaScript وردود JSON نصوص، والنص يُضغط جيداً.
- كل المتصفحات تفك gzip، وتفك Brotli أيضاً في صفحات HTTPS، وتقول ذلك للخادم في كل طلب (الترويسة `Accept-Encoding`).
- كل كيلوبايت زائد يؤخر ظهور الصفحة، وأكثر ما يظهر ذلك على شبكات الجوال.

## كيف تُصلح

فعّل الضغط في الخادم: gzip، أو Brotli الذي يضغط أكثر منه، والمتصفحات تطلبه عبر HTTPS وحدها. في nginx مثلاً:

```nginx
gzip on;
gzip_types text/css application/javascript application/json image/svg+xml;
```

- في Apache يفعل ذلك `mod_deflate`، وأغلب شبكات توزيع المحتوى (CDN) تضغط النصوص من نفسها.
- وتأكد أن الردود التي تولّدها التطبيقات، لا الملفات الثابتة وحدها، تمر بالضغط.

## كيف نكشف

1. نعرض الصفحة ونقرأ ردود النص التي حمّلها المتصفح: الصفحة نفسها، والسكربتات، وملفات CSS، وردود البيانات (XHR وfetch).
2. نضغط بـ gzip كل رد وصل دون `Content-Encoding`، كما فعل Lighthouse 12.
3. تفشل القاعدة إذا وفّر الضغط 1,400 بايت على الأقل، وكان ذلك 10% من الملف أو 20,000 بايت على الأقل، وهي حدود Lighthouse 12 نفسها.
4. لا نقرأ ملفاً لم نعرف حجمه قبل قراءته، ولا ملفاً أكبر من 5 MB.

## المراجع

- [MDN: الضغط في HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Compression) (بالإنجليزية)
- [Chrome: فعّل ضغط النصوص](https://developer.chrome.com/docs/lighthouse/performance/uses-text-compression) (بالإنجليزية)
- [nginx: وحدة gzip](https://nginx.org/en/docs/http/ngx_http_gzip_module.html) (بالإنجليزية)
