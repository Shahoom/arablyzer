---
reviewed: false
---

# الزحف (crawling)

الزحف أن تزور برامج محركات البحث صفحات الويب وتنزّل محتواها لتعرف ما فيها، وهو أول ما تمر به الصفحة قبل أن تظهر في نتائج البحث.

## التعريف

- الزحف أول مراحل بحث Google: برامج آلية تسمّى الزواحف (crawlers)، واسم زاحف Google هو Googlebot، تنزّل النصوص والصور والفيديوهات من الصفحات التي وجدتها على الويب.
- يجد Google الروابط في الصفحات التي يعرفها وفي خرائط الموقع التي ترسلها، ثم يعرض كل صفحة (rendering) ويشغّل ما فيها من JavaScript بإصدار حديث من Chrome.

## لماذا يهم

- لا يستطيع Google أن يفهرس محتوى صفحة لم يزحف إليها. وأشهر ما يعطّل الزحف مشكلات الخادم، ومشكلات الشبكة، وقواعد robots.txt.
- الزحف ليس فهرسة: قد تبقى صفحة زحف إليها Google خارج الفهرس، وقد يُفهرس رابط منعته من الزحف إن أشارت إليه صفحات أخرى.
- في المواقع العربية والإنجليزية، يوصي Google بأن يكون لكل نسخة لغة رابطها، وأن يصل بين النسختين رابط ظاهر، لا أن تتغير لغة الرابط نفسه بملفات تعريف الارتباط (cookies) أو بإعدادات المتصفح.

## مثال

صفحة منتج جديدة يصل إليها Googlebot من صفحة القسم:

```html
<!-- في https://example.com/ar/oud/ رابط إلى /ar/عود-كمبودي بعد ترميزه -->
<a href="/ar/%D8%B9%D9%88%D8%AF-%D9%83%D9%85%D8%A8%D9%88%D8%AF%D9%8A">عود كمبودي</a>
```

يجد Googlebot الرابط في `href`، ويقرأ robots.txt، ثم يجلب الصفحة ويعرضها، ويضيف إلى قائمة الزحف ما يجده فيها من روابط.

## أخطاء شائعة

- روابط بلا `href`، كزر يفتح الصفحة بحدث `onclick` وحده: قد لا يستخرج Google منها رابطاً.
- أحرف عربية بلا ترميز في `href`: يوصي Google بترميز الأحرف غير اللاتينية ترميزاً مئوياً (percent-encoding).
- تحويل الزائر حسب عنوان IP أو لغة المتصفح: يزحف Googlebot في الغالب من الولايات المتحدة، دون ترويسة `Accept-Language`، فقد لا يرى إلا نسخة واحدة.

## المراجع

- [Google Search Central: دليل مفصّل حول طريقة عمل بحث Google](https://developers.google.com/search/docs/fundamentals/how-search-works?hl=ar)
- [Google Search Central: فهم أساسيات JavaScript في تحسين محركات البحث](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics?hl=ar)
- [Google Search Central: أفضل الممارسات المتعلقة بالروابط](https://developers.google.com/search/docs/crawling-indexing/links-crawlable?hl=ar)
- [Google Search Central: أفضل الممارسات المتعلقة ببنية عناوين URL](https://developers.google.com/search/docs/crawling-indexing/url-structure?hl=ar)
- [Google Search Central: إدارة المواقع المتعددة المناطق واللغات](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites?hl=ar)
- [Google Search Central: معلومات عن ملف robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro?hl=ar)
