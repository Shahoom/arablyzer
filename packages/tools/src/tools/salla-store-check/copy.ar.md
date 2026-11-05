---
reviewed: false
summary: هل متجرك في سلة جاهز للبحث؟ افحص صفحة منتج للأساسيات.
---

# فاحص SEO لمتجر سلة

أعطِ عنوان صفحة من متجرك في سلة (أفضلها صفحة منتج) وتفحص هذه الأداة ما يقرؤه المتسوق وGoogle أولاً: العنوان والوصف ووسوم المشاركة وبيانات المنتج المنظّمة وروابط السياسات وعنوان الصفحة وإعدادات اللغة العربية. وتخبرك ما الذي تغيّره وأين في لوحة تحكم سلة.

## ماذا تفحص

- وصف الصفحة ووسوم المشاركة (`og:title` و`og:description` و`og:image`)، وتكتبها سلة من حقول SEO في المنتج أو المتجر.
- البيانات المنظّمة للمنتج: اسم وصورة وعرض بسعر مكتوب `120.00` ورمز عملة مثل `SAR` وعنوان للتوفّر.
- روابط سياسة الخصوصية والشروط وسياسة الاسترجاع وسياسة الشحن، ويبحث عنها Merchant Center والمتسوقون.
- عنوان الصفحة (جزؤه الأخير): بلا حركات ولا أرقام عربية شرقية ولا شرطات سفلية ولا أحرف كبيرة، وعنوان مرجعي مطابق.
- لغة الصفحة واتجاهها: `lang="ar"` و`dir="rtl"`.

## مثال

### خطأ

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <title>عطر العود الملكي | متجر الواحة</title>
    <link rel="canonical" href="https://shop.example/products/Royal_Oud">
    <link rel="stylesheet" href="https://cdn.salla.network/themes/raed.css">
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
    <link rel="stylesheet" href="https://cdn.salla.network/themes/raed.css">
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

أصلح كل بند في لوحة تحكم سلة ثم افحص الصفحة من جديد: قالب سلة يكتب هذه الوسوم من الحقول التي تملؤها.

```html
<meta name="description" content="عطر عود ملكي بتركيز عالٍ في زجاجة 50 مل، يُشحن خلال يومين.">
<link rel="canonical" href="https://shop.example/products/royal-oud">
```

- عنوان المنتج ووصفه وعنوان صفحته: افتح المنتج، وفي صفحة بياناته ابحث عن قسم SEO. املأ عنوان الصفحة والوصف، والعنوان المخصص (الجزء الأخير) إن شئت. ثم احفظ بيانات المنتج.
- الصفحة الرئيسية: في إعدادات المتجر ابحث عن صفحة SEO (تحسينات الصفحة الرئيسية)، واملأ العنوان والوصف.
- السياسات: أنشئ صفحات الخصوصية والشروط والاسترجاع والشحن من صفحات المتجر، وأضفها إلى قائمة التذييل.
- مركز مساعدة سلة يشرح كل هذا في مقالات SEO؛ وقد تتغير أسماء القوائم بين الإصدارات.

## أسئلة شائعة

### هل تعمل الأداة لمتاجر سلة وحدها؟

لا. تجري فحوص المتاجر على أي صفحة. وللصفحة التي ليست في سلة لا تنطبق الخطوات أدناه، وفحص المنصة يخبرك على ماذا تعمل.

### لماذا تفشل صفحة منتجي وقد ملأت حقول SEO؟

تكتب سلة الوسوم من الحقول، لكن القوالب تختلف، والحقل الفارغ يعود إلى الافتراضي للمتجر. افحص صفحة المنتج نفسها لا الرئيسية، وراجع مصدر الصفحة بحثاً عن الوسم.

### هل ترتفع الصفحة الأحسن في سلة في الترتيب؟

تسهّل على Google قراءتها وعلى المتسوق الثقة بها. لكنها لا تَعِد بترتيب: فهو يتبع الموقع كله وما يعرضه غيرك.

## المنهجية

الفحوص هي فحوص المتاجر التي يجريها Arablyzer على أي صفحة؛ لا تضيف سلة شيئاً إلى طريقة الحكم، بل إلى مكان الإصلاح. وخطوات الإصلاح من مركز مساعدة سلة ووثائق المطوّرين فيها. ولا نرى داخل لوحة التحكم، فقد يكون للقائمة اسم آخر في حسابك: إن لم تطابق خطوة فابحث في اللوحة عن «SEO».
