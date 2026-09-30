---
reviewed: false
---

# ملف robots.txt

robots.txt ملف نصي في جذر الموقع يقول للزواحف أي المسارات تزور وأيها تترك، وهو يدير الزحف ولا يخفي الصفحات من نتائج البحث.

## التعريف

- ملف نصي باسم `robots.txt` في المجلد الأعلى للموقع، مثل `https://example.com/robots.txt`، يتبع بروتوكول استبعاد الروبوتات (Robots Exclusion Protocol) الذي صار معياراً باسم RFC 9309 سنة 2022.
- يتألف من مجموعات: سطر `User-agent` أو أكثر يسمّي الزواحف، ثم قواعد `Disallow` و`Allow` للمسارات. يتبع الزاحف المجموعة التي تحمل اسمه، وإلا فمجموعة `*`، وتُطبّق أطول قاعدة تطابق الرابط.
- يسري على المضيف والبروتوكول والمنفذ الذي يُخدم منه فقط: ملف `https://example.com/robots.txt` لا يشمل `https://shop.example.com/` ولا `http://example.com/`.

## لماذا يهم

- يُستعمل أساساً لكي لا تثقل الزواحف على الموقع، لا لإخفاء الصفحات: قد يفهرس Google رابطاً ممنوعاً إن أشارت إليه صفحات أخرى، فيظهر في النتائج بلا وصف.
- قواعده ليست حماية: الزواحف المحترمة تتبعها وغيرها قد لا يتبعها، وكل مسار تكتبه فيه يصير معروفاً لمن يقرأ الملف.
- في المواقع العربية احفظ الملف بترميز UTF-8، وإلا فقد يتجاهل Google ما ليس منه فتبطل القاعدة. ولكل نطاق فرعي ملفه، مثل `ar.example.com` و`en.example.com`.

## مثال

ملف لمتجر يمنع صفحات السلة ونتائج البحث الداخلي، ويدل على خريطة الموقع:

```text
# https://example.com/robots.txt
User-agent: *
Disallow: /cart/
Disallow: /بحث/

Sitemap: https://example.com/sitemap.xml
```

يقارن Google القواعد بالروابط بعد ترميزها ترميزاً مئوياً، فيعامل `Disallow: /بحث/` كما يعامل `Disallow: /%D8%A8%D8%AD%D8%AB/`.

## أخطاء شائعة

- `Disallow: /` في مجموعة `*`، بقيت من نسخة التطوير فمنعت الموقع كله.
- منع صفحة فيها `noindex` في robots.txt: لن يرى Google القاعدة، وقد يبقى الرابط في النتائج.
- كتابة `noindex` أو `crawl-delay` في الملف: لا يدعم Google أياً منهما.
- رد الخادم على طلب الملف بخطأ `5xx`: يتوقف Google عن الزحف إلى الموقع كله في أول 12 ساعة.

## المراجع

- [RFC 9309: بروتوكول استبعاد الروبوتات](https://www.rfc-editor.org/rfc/rfc9309.html) (بالإنجليزية)
- [Google Search Central: معلومات عن ملف robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro?hl=ar)
- [Google: طريقة Google في تفسير مواصفات ملف robots.txt](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec?hl=ar)
- [Google Search Central: حظر الفهرسة باستخدام noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing?hl=ar)
