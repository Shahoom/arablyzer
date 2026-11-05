---
reviewed: false
summary: هل تذكر النسخ اللغوية في خريطة موقعك بعضها بعضاً وتستعمل رموزاً تقبلها Google؟
---

# فاحص hreflang في خريطة الموقع

أعطِ عنوان صفحة من موقعك وتقرأ هذه الأداة خرائط الموقع التي يسمّيها robots.txt (أو `/sitemap.xml`) وتفحص النسخ اللغوية التي تذكرها بـ `xhtml:link`: أن تذكر كل صفحة نفسها، وأن تذكر النسخ بعضها بالمقابل، وأن تكون رموز اللغة مما تقبله Google. ولا تقرأ إلا ملفات الخريطة.

## ماذا تفحص

- أن الصفحة التي تذكر نسخها تذكر نفسها أيضاً.
- أنه إذا ذكرت الصفحة A الصفحة B، وB مدخل في الخريطة نفسها، ذكرت B الصفحة A بالمقابل.
- أن كل `hreflang` لغة، وقد يتبعها كتابة وبلد، مما تقبله Google: `ar` و`ar-SA` و`en-GB` و`x-default`؛ لا `ara` ولا `en-UK` ولا `ar_SA`.
- أن كل نسخة عنوان كامل بـ `https://`.
- والنسخة التي ليست مدخلاً في الملف نفسه قد تكون في خريطة أخرى ولا نحكم عليها.

## مثال

### خطأ

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://www.example.com/ar/</loc>
    <xhtml:link rel="alternate" hreflang="ar" href="https://www.example.com/ar/"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/"/>
  </url>
  <url>
    <loc>https://www.example.com/en/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/"/>
  </url>
</urlset>
```

### صحيح

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://www.example.com/ar/</loc>
    <xhtml:link rel="alternate" hreflang="ar" href="https://www.example.com/ar/"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/"/>
  </url>
  <url>
    <loc>https://www.example.com/en/</loc>
    <xhtml:link rel="alternate" hreflang="ar" href="https://www.example.com/ar/"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/"/>
  </url>
</urlset>
```

## كيف تُصلح

أعطِ كل صفحات المجموعة قائمة النسخ نفسها، وفيها كل عنوانها:

```xml
<url>
  <loc>https://www.example.com/ar/</loc>
  <xhtml:link rel="alternate" hreflang="ar" href="https://www.example.com/ar/"/>
  <xhtml:link rel="alternate" hreflang="en" href="https://www.example.com/en/"/>
</url>
```

- أعلن المساحة الاسمية `xhtml` في `urlset`.
- استعمل الرموز التي يكتبها مولّد hreflang.
- استعمل عناوين كاملة تطابق `loc` الصفحات.
- أعطِ hreflang في الخريطة أو في `<head>` الصفحات، لا في الاثنتين بجوابين مختلفين.

## أسئلة شائعة

### أستعمل الخريطة أم وسوم الصفحة لـ hreflang؟

كلاهما يصلح. وسوم الصفحة لا تحتاج ملفاً آخر لكنها تزيد حجم كل صفحة؛ والخريطة تُبقي الصفحات خفيفة وأسهل توليداً لنسخ كثيرة. اختر واحدة وأتمّها.

### هل أحتاج x-default؟

ليس لازماً. وتوصي به Google لمن لا تطابق لغته نسخة.

### لماذا لا تُفحص صفحة ذكرتها؟

النسخة التي ليست مدخلاً في هذه الخريطة قد تكون في ملف خريطة آخر، ولا يُظهر ملف واحد هل تذكر الصفحةَ بالمقابل.

## المنهجية

يقرأ الفحص عناصر `xhtml:link` التي فيها `rel="alternate"` و`hreflang` في كل مدخل من كل خريطة (`urlset`) جلبها الفحص، وأول 5000 مدخل في كل منها، ويقارن العناوين بعد توحيدها. وتُحكم الرموز بالفحص الذي تستعمله أدوات hreflang في الصفحات. ولا يجلب الفحص إلا الخرائط التي يسمّيها robots.txt للموقع أولاً (أو `/sitemap.xml`)، عبر وسيط الخروج، ويحترم robots.txt الموقع.
