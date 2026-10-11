---
reviewed: false
summary: هل الملف في هذا العنوان ملف منتجات يقرؤه Google، أم صفحة ويب أو ملف فارغ أو XML مكسور؟
---

# فاحص ملف المنتجات

أعطنا عنوان ملف منتجاتك فنقول لك إن كان يُقرأ ملفَ منتجات: أنه الملف لا صفحة ويب، وأنه UTF-8، وأن XML فيه سليم، وأنه RSS أو Atom، وأن فيه منتجات. نطلب الملف الواحد وحده.

## ماذا تفحص

- أن العنوان يعطي ملف منتجات لا صفحة ويب: عنوان المتجر أو صفحة الدخول ليست ملف منتجات.
- أن الملف غير فارغ وهو UTF-8 صالح، الترميز الذي تحتاجه العربية لتصل سليمة.
- أن ملف XML سليم البناء، ونقول أين ينكسر، وأن جذره `rss` أو `feed` لا خريطة موقع أو مستند آخر.
- أن في الملف منتجات، وأن الصف الأول في ملف النص يسمّي أعمدته.

## مثال

### خطأ

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://shop.example/p/oud-1</loc></url>
  <url><loc>https://shop.example/p/msk-2</loc></url>
</urlset>
```

### صحيح

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>متجر الواحة</title>
    <link>https://shop.example/</link>
    <description>منتجات متجر الواحة</description>
    <item>
      <g:id>OUD-1</g:id>
      <title>عطر العود الملكي 50 مل</title>
      <description>عطر من خشب العود الطبيعي بتركيز عالٍ ويدوم طويلاً.</description>
      <link>https://shop.example/p/oud-1</link>
      <g:image_link>https://shop.example/img/oud-1.jpg</g:image_link>
      <g:price>120.00 SAR</g:price>
      <g:availability>in_stock</g:availability>
      <g:condition>new</g:condition>
      <g:gtin>4006381333931</g:gtin>
      <g:brand>الواحة</g:brand>
    </item>
    <item>
      <g:id>MSK-2</g:id>
      <title>مسك أبيض 20 مل</title>
      <description>مسك أبيض ناعم برائحة هادئة يناسب الاستخدام اليومي.</description>
      <link>https://shop.example/p/msk-2</link>
      <g:image_link>https://shop.example/img/msk-2.jpg</g:image_link>
      <g:price>45.500 OMR</g:price>
      <g:sale_price>39.900 OMR</g:sale_price>
      <g:availability>preorder</g:availability>
      <g:gtin>036000291452</g:gtin>
    </item>
  </channel>
</rss>
```

## كيف تُصلح

1. افتح العنوان في المتصفح: ملف المنتجات يعرض XML أو نصاً مفصولاً بعلامات جدولة، لا صفحة فيها قائمة.
2. انسخ عنوان الملف من تصدير Google Shopping أو Merchant Center في المنصة، أو من إعدادات إضافة الملف.
3. احفظ الملف بترميز UTF-8 وصرّح به في أول سطر من XML: `<?xml version="1.0" encoding="UTF-8"?>`.
4. هرّب `&` و`<` و`>` في الأسماء والأوصاف، أو ضع النص داخل `<![CDATA[ … ]]>`.
5. إذا صار الملف يُقرأ فافحص منتجاته بـ[فاحص ملف منتجات Google Merchant](/tools/feed-check).

## أسئلة شائعة

### ملفي بصيغة .gz. لماذا لم يُفحص؟

يقرأ Merchant Center الملفات المضغوطة، أما هذا الفحص فيقرأ ملفات XML والنص فقط، فيقول إنه لم يستطع الفحص ولا يعدّه عيباً. أعطنا عنوان الملف غير المضغوط إن كانت المنصة تتيحه.

### متجري لا يعطيني إلا صفحة، ولا عنوان ملف. ماذا أفعل؟

عندها تحتاج منصتك إلى تصدير أو تطبيق يصنع ملف Google Shopping. ملف المنتجات ملف تولّده المنصة؛ ولا شيء نفحصه حتى يوجد.

### هل خريطة الموقع ملف منتجات؟

لا. خريطة الموقع تعدّد صفحاتك لمحركات البحث، وملف المنتجات يعدّد منتجاتك بأسعارها ومخزونها لـ Merchant Center. تميّز الأداة بينهما بعنصر الجذر في الملف.

## المنهجية

نجلب العنوان ونقرأ جسم الاستجابة: الجسم الذي يبدأ كأنه HTML صفحة ويب، والخالي فارغ، وما ليس UTF-8 صالحاً نقول ذلك، ونقرأ XML بقارئ صارم، وما سوى ذلك نقرؤه نصاً مفصولاً بعلامات جدولة. وملف gzip الذي يصل كما هو لا نقرؤه، وتقول النتيجة إننا لم نستطع الفحص. التفاصيل في صفحة القاعدة.
