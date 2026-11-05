---
reviewed: false
summary: هل ما زال متجرك في زد يستعمل عنوان زد ووصفها الافتراضيين؟ افحص صفحة.
---

# فاحص SEO لمتجر زد

أعطِ عنوان صفحة من متجرك في زد (الرئيسية أو منتج) وتفحص هذه الأداة هل العنوان والوصف هما اللذان تكتبهما زد حين لا تضبط شيئاً، ثم وسوم المشاركة وبيانات المنتج المنظّمة وروابط السياسات وعنوان الصفحة.

## ماذا تفحص

- العنوان الافتراضي في زد («الاسم | متجر إلكتروني») والوصف الافتراضي («اكتشف منتجات وتشكيلات وأحدث عروض…»)، وهما يقولان الكلام نفسه في كل متجر.
- وصف الصفحة ووسوم المشاركة (`og:title` و`og:description` و`og:image`).
- البيانات المنظّمة للمنتج: اسم وصورة وعرض بسعر مكتوب `120.00` ورمز عملة مثل `SAR` وعنوان للتوفّر.
- روابط سياسة الخصوصية والشروط وسياسة الاسترجاع وسياسة الشحن.
- عنوان الصفحة (جزؤه الأخير): بلا حركات ولا أرقام عربية شرقية ولا شرطات سفلية ولا أحرف كبيرة، وعنوان مرجعي مطابق.

## مثال

### خطأ

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="description" content="اكتشف منتجات وتشكيلات وأحدث عروض الواحة.">
    <title>الواحة | متجر إلكتروني</title>
    <link rel="canonical" href="https://shop.example/products/Royal_Oud">
    <link rel="icon" href="https://media.zid.store/icon.png">
    <script src="https://static.zid.store/js/script_loader.js"></script>
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
    <link rel="icon" href="https://media.zid.store/icon.png">
    <script src="https://static.zid.store/js/script_loader.js"></script>
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

أصلح كل بند في لوحة تحكم زد ثم افحص الصفحة من جديد: قالب زد يكتب هذه الوسوم من الحقول التي تملؤها.

```html
<meta name="description" content="عطر عود ملكي بتركيز عالٍ في زجاجة 50 مل، يُشحن خلال يومين.">
<link rel="canonical" href="https://shop.example/products/royal-oud">
```

- عنوان المتجر ووصفه: افتح إعدادات SEO للمتجر في لوحة زد واكتبهما للصفحة الرئيسية. وتذكر وثائق المطوّرين في زد الأقسام التي تقبل محتوى SEO: الصفحة الرئيسية والمنتجات والتصنيفات والصفحات.
- عنوان المنتج ووصفه وعنوان صفحته: افتح المنتج في اللوحة واملأ حقول SEO فيه.
- السياسات: أنشئ صفحات الخصوصية والشروط والاسترجاع والشحن وأضفها إلى قائمة التذييل.
- تختلف أسماء القوائم بين الإصدارات: ابحث في اللوحة عن «SEO»، أو اسأل دعم زد.

## أسئلة شائعة

### كيف أعرف أن العنوان هو الافتراضي من زد؟

ينتهي بـ « | متجر إلكتروني»، وهي الصيغة التي كتبتها زد في متجرها التجريبي حين نظرنا. وإن غيّرت زد العبارة فلن تشير إليه الأداة، لكن النصيحة قائمة: عنوان فيه أسماء منتجاتك أحسن من أي افتراضي.

### هل تعمل الأداة لمتاجر زد وحدها؟

لا. تجري فحوص المتاجر على أي صفحة، وأول فحص فيها لزد وحدها: لا ينطبق إلا على صفحة يتعرف فحص المنصة على أنها من زد.

### هل أغيّر عنوان كل منتج؟

ابدأ بالصفحة الرئيسية وبالمنتجات والتصنيفات الأكثر مبيعاً. والمنتج الذي له عنوان ووصف خاصان يُقرأ أحسن من الذي له الافتراضي.

## المنهجية

الفحص الأول لزد وحدها: لا ينطبق إلا حين يتعرف فحص المنصة في Arablyzer على زد بثقة كافية، ويشير إلى صيغة العنوان والوصف التي رأيناها في متجر زد التجريبي بتاريخ `2026-11-04`. وبقية الفحوص هي فحوص المتاجر التي يجريها Arablyzer على أي صفحة. وخطوات الإصلاح من وثائق المطوّرين في زد؛ ولا نرى داخل لوحة التحكم، فقد يكون للقائمة اسم آخر في حسابك.
