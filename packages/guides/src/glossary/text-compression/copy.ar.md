---
reviewed: false
---

# ضغط النصوص (gzip وBrotli)

ضغط النصوص أن يضغط الخادم HTML وCSS وJavaScript وJSON قبل إرسالها فيفكّها المتصفح، فتصل بايتات أقل، ويُعلن ذلك بالترويسة Content-Encoding.

## التعريف

- يرسل المتصفح الترويسة `Accept-Encoding` بالخوارزميات التي يدعمها وترتيب تفضيله لها، ويختار الخادم واحدة منها فيضغط بها جسم الرد، ويعلم المتصفح بما اختار في الترويسة `Content-Encoding` (MDN). وتقول RFC 9110 إن `Content-Encoding` تسرد أنواع الترميز المطبّقة بترتيب تطبيقها، ليفكّها المستقبِل فيحصل على المحتوى بنوعه المذكور في `Content-Type` (القسم 8.4).
- في `Accept-Encoding` قد يقرن المتصفح كل خوارزمية بوزن `q`. وإذا غابت الترويسة اعتُبر أي ترميز مقبولاً، وإذا كانت فارغة فالمتصفح لا يريد أي ترميز (RFC 9110، القسم 12.5.3).
- تقول MDN إن الخوارزميتين المهمتين اليوم هما `gzip`، وهي الأكثر انتشاراً، و`br` أي Brotli. وصيغة gzip في RFC 1952 صيغة ضغط دون فقد، تعتمد الخوارزمية DEFLATE، ويمكن تنفيذها دون خرق براءات اختراع. أما Brotli فيصفه RFC 7932 بأنه صيغة ضغط دون فقد تجمع LZ77 وترميز هافمان (Huffman).
- الذي يُضغط هو الموارد النصية، مثل HTML وCSS وJavaScript وJSON وSVG. وتوصي MDN بتفعيل الضغط لكل الملفات إلا المضغوطة أصلاً، كالصور والصوت والفيديو.

## لماذا يهم

- تعدّ MDN الضغط وسيلة مهمة لتحسين أداء الموقع، وتذكر أن حجم بعض المستندات قد ينقص بما يصل إلى 70%، وأن النص قد يكون فيه تكرار يصل إلى 60%. وتقول Chrome إن الموارد النصية ينبغي أن تُقدَّم مضغوطة لتقليل البايتات المنقولة.
- يُحسب مقياس LCP من بدء الانتقال إلى الصفحة. وما ينزّله المتصفح قبل أن يرسم الصفحة، من HTML وCSS وJavaScript، جزء من ذلك الوقت، فكلما قلّت بايتاته قصر تنزيله. أما الصور فلا يغيّرها هذا الإجراء.
- الحرف العربي بايتان في UTF-8، فالنص العربي أكبر بالبايتات من نص لاتيني بالعدد نفسه من الحروف.
- تنصح Chrome باستعمال Brotli لأنه يصغّر الملفات أكثر من الخوارزميات الأخرى، وبجعل gzip بديلاً عنه.
- تضغط قاعدة `text-compression-missing` بخوارزمية gzip كل رد نص وصل دون `Content-Encoding` لتقيس ما كان سيوفره، ولا تبلّغ إلا حين يتجاوز التوفير حدوداً أخذتها من Lighthouse. وتفاصيلها في صفحة القاعدة.

## مثال

طلب وردّه، على نسق مثال MDN، مع نوع المحتوى:

```http
GET /app.js HTTP/1.1
Accept-Encoding: br, gzip

HTTP/1.1 200 OK
Content-Type: text/javascript
Content-Encoding: br
Vary: Accept-Encoding
```

والترويسة `Vary: Accept-Encoding` لازمة: تقول MDN إن على الخادم أن يرسلها مع `Content-Encoding`، لتستطيع الذاكرة المؤقتة (cache) أن تحفظ كل صيغة من المورد على حدة.

وللتحقق افتح أدوات المطور في Chrome، ثم تبويب Network، واختر الطلب، وانظر الترويسة `content-encoding` بين ترويسات الرد. أو من الطرفية:

```sh
curl -sI -H 'Accept-Encoding: gzip, br' https://example.com/ | grep -i content-encoding
```

## أخطاء شائعة

- ضغط ما هو مضغوط أصلاً: تقول MDN إن ضغط أنواع مثل `.zip` و`.jpeg` غير مناسب في الغالب لأنه قد يزيد الحجم.
- نسيان `Vary: Accept-Encoding` مع الرد المضغوط.
- ضغط الملفات الثابتة وحدها وترك الردود التي تولّدها التطبيقات، كردود JSON، بلا ضغط.

## المراجع

- [MDN: الضغط في HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Compression) (بالإنجليزية)
- [MDN: الترويسة Content-Encoding](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Encoding) (بالإنجليزية)
- [IETF: RFC 9110، دلالات HTTP](https://www.rfc-editor.org/rfc/rfc9110) (بالإنجليزية)
- [IETF: RFC 1952، صيغة ملف gzip](https://www.rfc-editor.org/rfc/rfc1952) (بالإنجليزية)
- [IETF: RFC 7932، صيغة Brotli](https://www.rfc-editor.org/rfc/rfc7932) (بالإنجليزية)
- [Chrome: فعّل ضغط النصوص](https://developer.chrome.com/docs/lighthouse/performance/uses-text-compression) (بالإنجليزية)
