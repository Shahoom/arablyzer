---
reviewed: false
---

# زاحف Google (Googlebot)

Googlebot هو الاسم العام لزاحفين يقرأ بهما بحث Google صفحات الويب، أحدهما يحاكي مستخدماً على هاتف ذكي والآخر يحاكي مستخدماً على حاسوب مكتبي.

## التعريف

- Googlebot اسم عام لنوعين من زواحف بحث Google: Googlebot للهواتف الذكية وGooglebot للكمبيوتر المكتبي. وكلاهما يتبع الاسم نفسه في robots.txt، وهو `Googlebot`، فلا تستطيع أن تخص أحدهما بقاعدة.
- يفهرس Google نسخة الجوال في معظم المواقع، فأغلب الطلبات من زاحف الهاتف. ولبحث Google يقرأ Googlebot أول 2 ميغابايت من الملف غير مضغوط، وأول 64 ميغابايت من ملف PDF، ولا يُفهرس ما بعدها.

## لماذا يهم

- منع Googlebot يؤثر في بحث Google كله، ومنه Discover، وفي منتجات أخرى مثل صور Google وأخبار Google.
- كثيراً ما تنتحل زواحف أخرى اسم Googlebot في ترويسة `user-agent`، فتحقّق من الطلب قبل أن تحظره أو تستثنيه: ببحث DNS عكسي على عنوان IP، أو بمطابقته مع نطاقات العناوين التي ينشرها Google.
- يزحف Google في الغالب من عناوين IP في الولايات المتحدة، فجدار الحماية أو CDN الذي يحجب الزيارات من خارج بلدك قد يحجب Googlebot أيضاً. وإن رأى Google ذلك فقد يحاول الزحف من بلدان أخرى.

## مثال

التحقق من أن طلباً في سجلات الخادم جاء من Googlebot، بالمثال الذي يعرضه Google:

```text
$ host 66.249.66.1
1.66.249.66.in-addr.arpa domain name pointer crawl-66-249-66-1.googlebot.com.

$ host crawl-66-249-66-1.googlebot.com
crawl-66-249-66-1.googlebot.com has address 66.249.66.1
```

الاسم في نطاق `googlebot.com`، والبحث عنه يعيد العنوان نفسه، فالطلب من Google. وإن فشل أحد الفحصين فالطلب ليس منه، أياً كان الاسم في ترويسته.

## أخطاء شائعة

- الوثوق بترويسة `user-agent` وحدها، وهي سهلة الانتحال.
- كتابة `crawl-delay` لإبطاء Googlebot: لا يدعمها Google. وفي حالة طارئة يقترح Google الرد بالرمز `500` أو `503` أو `429`، لكن لساعات أو ليوم أو يومين فقط، وإلا فقد تسقط الروابط من الفهرس.
- نسخة جوال فيها محتوى أو روابط أقل من نسخة الحاسوب: يفهرس Google نسخة الجوال في معظم المواقع.

## المراجع

- [Google Search Central: Googlebot](https://developers.google.com/search/docs/crawling-indexing/googlebot?hl=ar)
- [Google: التحقق من أن برامج الزحف من Google هي مصدر الطلبات](https://developers.google.com/crawling/docs/crawlers-fetchers/verify-google-requests?hl=ar)
- [Google: نظرة عامة على برامج الزحف وبرامج الجلب من Google](https://developers.google.com/crawling/docs/crawlers-fetchers/overview-google-crawlers?hl=ar)
- [Google: طريقة Google في تفسير مواصفات ملف robots.txt](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec?hl=ar)
- [Google: كيفية خفض معدل زحف Google](https://developers.google.com/crawling/docs/crawlers-fetchers/reduce-crawl-rate?hl=ar)
