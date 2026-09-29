---
reviewed: false
---

# علامة noindex

noindex قاعدة تضعها في وسم meta أو في ترويسة HTTP لتطلب من محركات البحث ألا تعرض الصفحة في نتائجها، ولا تعمل إلا إن استطاع الزاحف قراءتها.

## التعريف

- `noindex` قاعدة تمنع محركات البحث التي تدعمها، ومنها Google، من فهرسة الصفحة: حين يجدها Googlebot يحذف Google الصفحة من نتائج البحث كلياً، حتى لو أشارت إليها مواقع أخرى.
- تضعها في وسم `<meta name="robots" content="noindex">` في `<head>` الصفحة، أو في ترويسة `X-Robots-Tag: noindex` في رد الخادم، وهي تصلح أيضاً لملفات PDF والصور. ولا يدعمها Google في robots.txt.

## لماذا يهم

- هي ما يوصي به Google لإبقاء صفحة خارج نتائجه، لا robots.txt الذي قد يُبقي الرابط مفهرساً. وتناسب صفحات مثل نتائج البحث الداخلي وصفحة «شكراً لطلبك».
- لا تعمل إلا إن رآها Google: يجب ألا تكون الصفحة ممنوعة في robots.txt، وأن يستطيع الزاحف الوصول إليها.
- لا يظهر أثرها حتى يعيد Googlebot الزحف إلى الصفحة، وقد يستغرق ذلك أشهراً لبعض الصفحات حسب أهميتها. وتستطيع أن تطلب إعادة الزحف من أداة فحص عنوان URL.

## مثال

صفحة نتائج البحث الداخلي، بوسم في `<head>`:

```html
<!-- في https://example.com/بحث?q=عود -->
<meta name="robots" content="noindex">
```

وملف PDF لا تريده في النتائج، بترويسة في رد الخادم:

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
X-Robots-Tag: noindex
```

## أخطاء شائعة

- `noindex` مع منع الصفحة في robots.txt: لن يرى Google القاعدة، وقد تبقى الصفحة في النتائج إن أشارت إليها صفحات أخرى.
- قاعدة بقيت من نسخة التطوير أو من إعداد في نظام إدارة المحتوى: يعرض تقرير «فهرسة الصفحات» في Search Console الصفحات التي وجد فيها Googlebot قاعدة `noindex`.
- حذف `noindex` عبر JavaScript: قد يتخطى Google تشغيل JavaScript في صفحة فيها القاعدة في كودها الأصلي، فلا يرى حذفها.
- ظن أن `noindex` يمنع اتباع الروابط في الصفحة: ذلك `nofollow`، والقيمة `none` تجمع الاثنين.

## المراجع

- [Google Search Central: حظر الفهرسة باستخدام noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing?hl=ar)
- [Google Search Central: مواصفات وسم meta لبرامج الروبوت وX-Robots-Tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag?hl=ar)
- [Google Search Central: معلومات عن ملف robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro?hl=ar)
- [Google Search Central: فهم أساسيات JavaScript في تحسين محركات البحث](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics?hl=ar)
