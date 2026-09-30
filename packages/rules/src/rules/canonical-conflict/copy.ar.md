---
reviewed: true
---

# روابط canonical متعارضة في الصفحة

## الرسائل

### multiple-tags

في الصفحة أكثر من وسم `<link rel="canonical">`، وتشير إلى روابط مختلفة.

### header-mismatch

رابط canonical في ترويسة Link ({headerUrl}) يخالف الرابط في وسم `<link rel="canonical">` ({tagUrl}).

### multiple-headers

ترويسات Link في الاستجابة تعطي أكثر من رابط canonical مختلف.

## لماذا يهم

- رابط canonical يخبر Google أي نسخة من الصفحة هي الأصل حين تصل إليها روابط كثيرة، مثل نسخ فيها `?ref=` أو ترتيب مختلف للمنتجات.
- يطلب Google رابط canonical واحداً لكل صفحة. إذا أعطته الصفحة روابط متعارضة فقد يتجاهلها كلها ويختار الأصل بنفسه، وقد يختار نسخة لا تريدها.
- قد يأتي التعارض من مصدرين يضيفان الوسم معاً، مثل القالب وإضافة SEO، أو من إعدادات الخادم التي تضيف الترويسة.

## كيف تُصلح

أبقِ رابط canonical واحداً، برابط كامل، من مصدر واحد:

```html
<link rel="canonical" href="https://example.com/oud" />
```

- إذا كان في الصفحة وسمان فاحذف أحدهما، أو عطّل إضافته في القالب أو في إضافة SEO.
- إذا كنت تستخدم ترويسة `Link` فاجعلها تشير إلى الرابط نفسه الذي في الوسم، أو احذف أحدهما.
- ضع الوسم داخل `<head>`؛ Google يتجاهل الوسم إذا كان داخل `<body>`.

## كيف نكشف

1. نجمع وسوم `<link rel="canonical">` داخل `<head>`، وروابط `rel="canonical"` في ترويسات `Link`.
2. نحوّل كل رابط إلى رابط كامل، على أساس `<base>` إن وُجد أو رابط الصفحة، ونحذف الجزء بعد `#`.
3. إذا بقي أكثر من رابط مختلف فالقاعدة تفشل، ونذكر في الدليل كل الروابط ومصادرها. الروابط المتطابقة لا تُعدّ تعارضاً، والشرطة المائلة في آخر الرابط تجعله رابطاً مختلفاً.

## المراجع

- [Google: كيفية تحديد عنوان URL أساسي باستخدام rel="canonical"](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls?hl=ar)
- [Google: خمسة أخطاء شائعة في rel=canonical](https://developers.google.com/search/blog/2013/04/5-common-mistakes-with-relcanonical?hl=ar)
- [RFC 6596: علاقة الربط canonical](https://www.rfc-editor.org/rfc/rfc6596.html) (بالإنجليزية)
