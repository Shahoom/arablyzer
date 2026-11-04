---
reviewed: false
---

# النسخ اللغوية في خريطة الموقع غير مكتملة

## الرسائل

### no-self

{count} من صفحات خريطة الموقع {sitemap} تذكر نسخاً لغوية ولا تذكر نفسها، مثل {url}.

### no-return

{count} من صفحات خريطة الموقع {sitemap} تذكر نسخة لا تذكرها بالمقابل، مثل {url} (تذكر {alternate}).

### bad-code

{count} من رموز اللغة في خريطة الموقع {sitemap} لا تقبلها Google، مثل «{code}» في {url}.

### relative

{count} من النسخ في خريطة الموقع {sitemap} ليست عناوين كاملة، مثل «{alternate}» في {url}.

## لماذا يهم

- يمكن لخريطة الموقع أن تعطي Google النسخ اللغوية للصفحة بعناصر `xhtml:link`. وتطلب Google أن تذكر كل صفحة نسخها كلها، ومنها نفسها، وأن تذكر كل نسخة الأخريات: فإن لم تذكر صفحة الأخرى بالمقابل فقد تتجاهل Google الزوج.
- ورمز لغة أو بلد لا تقبله Google (`ara` أو `en-UK` أو `ar_SA`) يُتجاوز ولا تُطابَق تلك النسخة.
- ويجب أن تكون النسخة عنواناً كاملاً بـ `https://`، كما تعطي الخريطة العناوين كلها.

## كيف تُصلح

أعطِ كل صفحات المجموعة القائمة نفسها، وفيها كل عنوانها:

```html
<url>
  <loc>https://shop.example/ar/oud</loc>
  <xhtml:link rel="alternate" hreflang="ar" href="https://shop.example/ar/oud"/>
  <xhtml:link rel="alternate" hreflang="en" href="https://shop.example/en/oud"/>
</url>
<url>
  <loc>https://shop.example/en/oud</loc>
  <xhtml:link rel="alternate" hreflang="ar" href="https://shop.example/ar/oud"/>
  <xhtml:link rel="alternate" hreflang="en" href="https://shop.example/en/oud"/>
</url>
```

- أعلن المساحة الاسمية `xhtml` في `urlset` (`xmlns:xhtml="http://www.w3.org/1999/xhtml"`).
- استعمل الرموز التي يكتبها مولّد hreflang: `ar` و`ar-SA` و`en` و`en-GB` و`x-default`.
- اكتب عناوين كاملة، هي نفسها `loc` الصفحات التي تشير إليها.
- استعمل hreflang في الخريطة أو في الصفحات لا فيهما بجوابين مختلفين.

## كيف نكشف

1. نقرأ خرائط الموقع التي جلبها الفحص وهي `urlset`، وأول 5000 مدخل في كل منها، وعناصر `xhtml:link` التي فيها `rel="alternate"` و`hreflang`.
2. رسالة `no-self`: صفحة تذكر نسخاً بدلاً ولا واحدة منها عنوانها هي.
3. رسالة `no-return`: صفحة تذكر نسخة هي مدخل في الملف نفسه، ولا يذكر ذلك المدخل الصفحةَ. أما النسخة التي ليست في هذا الملف فقد تكون في خريطة أخرى ولا نحكم عليها.
4. رسالة `bad-code` بالفحص نفسه الذي يفحص رموز hreflang في الصفحات؛ ورسالة `relative` عنوان لا يبدأ بـ http:// أو https://.
5. نتيجة واحدة لكل رسالة ولكل خريطة، فيها العدد وأول مثال.

## المراجع

- [Google Search Central: النسخ المحلية في خريطة الموقع](https://developers.google.com/search/docs/specialty/international/localized-versions#sitemap)
