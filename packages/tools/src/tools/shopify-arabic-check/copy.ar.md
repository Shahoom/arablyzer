---
reviewed: false
summary: هل متجرك في Shopify عربي كما ينبغي؟ افحص اللغة والاتجاه والأساسيات.
---

# فاحص متجر Shopify العربي

أعطِ عنوان صفحة من متجرك في Shopify وتفحص هذه الأداة اكتمال إعداده العربي: هل الصفحة معلنة عربية ومن اليمين إلى اليسار وهل نصها مترجم، ثم الوصف ووسوم المشاركة وبيانات المنتج المنظّمة وروابط السياسات وعنوان الصفحة.

## ماذا تفحص

- أن الصفحة المعروضة بالعربية (سكربت Shopify نفسه يقول `Shopify.locale = "ar"`) تعلن `lang="ar"` و`dir="rtl"`، وأن نصها عربي في معظمه.
- وصف الصفحة ووسوم المشاركة (`og:title` و`og:description` و`og:image`).
- البيانات المنظّمة للمنتج: اسم وصورة وعرض بسعر مكتوب `120.00` ورمز عملة مثل `SAR` وعنوان للتوفّر.
- روابط سياسة الخصوصية والشروط وسياسة الاسترجاع وسياسة الشحن.
- عنوان الصفحة (handle): بلا حركات ولا أرقام عربية شرقية ولا شرطات سفلية ولا أحرف كبيرة، وعنوان مرجعي مطابق.

## مثال

### خطأ

```html
<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8">
    <title>عطر العود الملكي | متجر الواحة</title>
    <link rel="canonical" href="https://shop.example/products/Royal_Oud">
    <script src="https://cdn.shopify.com/s/files/1/0001/theme.js"></script>
    <script>
      var Shopify = Shopify || {};
      Shopify.locale = "ar";
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "عطر العود الملكي",
      "image": "https://shop.example/img/royal-oud.jpg",
      "offers": {
        "@type": "Offer",
        "price": "١٢٠",
        "priceCurrency": "SAR",
        "availability": "https://schema.org/InStock"
      }
    }
    </script>
  </head>
  <body>
    <main>
      <h1>عطر العود الملكي</h1>
      <p>عطر عود ملكي بتركيز عالٍ في زجاجة من 50 مل.</p>
      <a href="/cart">السلة</a>
    </main>
  </body>
</html>
```

### صحيح

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <title>عطر العود الملكي | متجر الواحة</title>
    <meta name="description" content="عطر عود ملكي بتركيز عالٍ في زجاجة 50 مل، يُشحن خلال يومين.">
    <meta property="og:title" content="عطر العود الملكي | متجر الواحة">
    <meta property="og:description" content="عطر عود ملكي بتركيز عالٍ في زجاجة 50 مل.">
    <meta property="og:image" content="https://shop.example/img/royal-oud.jpg">
    <link rel="canonical" href="https://shop.example/products/royal-oud">
    <script src="https://cdn.shopify.com/s/files/1/0001/theme.js"></script>
    <script>
      var Shopify = Shopify || {};
      Shopify.locale = "ar";
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "عطر العود الملكي",
      "image": "https://shop.example/img/royal-oud.jpg",
      "offers": {
        "@type": "Offer",
        "price": "120.00",
        "priceCurrency": "SAR",
        "availability": "https://schema.org/InStock"
      }
    }
    </script>
  </head>
  <body>
    <main>
      <h1>عطر العود الملكي</h1>
      <p>عطر عود ملكي بتركيز عالٍ في زجاجة من 50 مل.</p>
      <a href="/cart">السلة</a>
    </main>
  <footer>
    <a href="/privacy">سياسة الخصوصية</a>
    <a href="/terms">الشروط والأحكام</a>
    <a href="/returns">سياسة الاسترجاع</a>
    <a href="/shipping">الشحن والتوصيل</a>
  </footer>
  </body>
</html>
```

## كيف تُصلح

أصلح كل بند في لوحة Shopify ثم افحص الصفحة من جديد.

```html
<meta name="description" content="عطر عود ملكي بتركيز عالٍ في زجاجة 50 مل، يُشحن خلال يومين.">
<link rel="canonical" href="https://shop.example/products/royal-oud">
```

- اللغة: أضف العربية من إعدادات اللغات في المتجر، وترجم المحتوى في Translate & Adapt، ولا تنشر اللغة للمتسوقين قبل اكتمال الترجمة.
- الاتجاه: استعمل قالباً يدعم النص من اليمين إلى اليسار (يمكن تصفية متجر القوالب بهذه الميزة)، أو اطلب من مطوّر قالبك أن يضبط `lang` و`dir` من لغة الصفحة.
- عنوان المنتج ووصفه وhandle: افتح المنتج، وفي قسم قائمة محرك البحث (Search engine listing) عدّل عنوان الصفحة والوصف وhandle الرابط.
- السياسات: اكتبها في إعدادات السياسات في المتجر، وأضف روابطها إلى قائمة تذييل القالب (قسم القوائم اسمه Navigation أو Menus بحسب الإصدار).

## أسئلة شائعة

### لماذا يعرض متجري نصاً إنجليزياً والعربية مفعّلة؟

تنشر Shopify اللغة حين تفعّلها، لكن المحتوى يبقى بلغة المتجر الأولى حتى تترجمه. ترجم المنتجات والمجموعات والصفحات والقوائم ونصوص القالب، أو أخفِ اللغة حتى تفعل.

### هل تتولى Shopify الاتجاه من اليمين إلى اليسار وحدها؟

ليس وحدها: يجب أن يدعمه القالب. والقوالب التي تفعل معلَّمة في متجر القوالب، ويمكن لتطبيق أو مطوّر إضافته إلى قالب لا يدعمه.

### هل تعمل الأداة لمتاجر Shopify وحدها؟

لا. تجري فحوص المتاجر على أي صفحة، وأول فحص فيها لـ Shopify وحدها: لا ينطبق إلا على صفحة يقول سكربت Shopify نفسه إنها تُعرض بالعربية.

## المنهجية

الفحص الأول لـ Shopify وحدها: لا ينطبق إلا حين يتعرف فحص المنصة على Shopify ويضبط سكربت مضمّن في الصفحة `Shopify.locale` على العربية. وبقية الفحوص هي فحوص المتاجر التي يجريها Arablyzer على أي صفحة. وخطوات الإصلاح من سجل تغييرات Shopify ومركز مساعدتها؛ ولا نرى داخل لوحتك، فقد يكون للقائمة اسم آخر في حسابك.
