---
reviewed: false
---

# قيم في ملف المنتجات يرفضها Merchant Center

## الرسائل

### availability

{count} منتج توفّره «{value}»؛ يقبل Merchant Center القيم `in_stock` و`out_of_stock` و`preorder` و`backorder`. أولها {id}.

### condition

{count} منتج حالته «{value}»؛ يقبل Merchant Center القيم `new` و`refurbished` و`used`. أولها {id}.

### price-arabic-digits

{count} منتج يكتب `{attribute}` بأرقام عربية مشرقية أو فواصلها («{value}»)؛ يقرأ Merchant Center الأرقام 0–9 والنقطة فقط. أولها {id}.

### price-separator

{count} منتج يكتب `{attribute}` بفاصلة («{value}»)؛ اكتب الرقم بنقطة للكسر العشري وبلا فاصل للآلاف. أولها {id}.

### price-currency-missing

{count} منتج يكتب `{attribute}` بلا رمز عملة («{value}»)؛ اكتب الرقم ثم مسافة ثم رمز ISO، مثل `120.00 SAR`. أولها {id}.

### price-currency-unknown

{count} منتج يكتب `{attribute}` برمز عملة ليس في ISO 4217 («{value}»). أولها {id}.

### price-format

{count} منتج يكتب `{attribute}` بصيغة لا يقرؤها Merchant Center («{value}»)؛ اكتب الرقم ثم مسافة ثم رمز العملة حسب ISO. أولها {id}.

### sale-price

{count} منتج `sale_price` فيه ليس أقل من `price` («{value}»). أولها {id}.

### link

{count} منتج `{attribute}` فيه ليس عنوان http أو https كاملاً («{value}»). أولها {id}.

### gtin-arabic-digits

{count} منتج يكتب `gtin` بأرقام عربية مشرقية («{value}»)؛ رقم GTIN أرقام 0–9. أولها {id}.

### gtin-length

{count} منتج `gtin` فيه بطول خاطئ أو بحروف غير الأرقام («{value}»)؛ طول GTIN 8 أو 12 أو 13 أو 14 رقماً. أولها {id}.

### gtin-checksum

{count} منتج رقم التحقق في `gtin` فيه خاطئ («{value}»). أولها {id}.

## لماذا يهم

- يرفض Merchant Center المنتجات التي لا يقرأ قيمها. سعر لا يفهمه، أو توفّر لا يعرفه، أو GTIN خاطئ يعني خروج المنتج من Shopping والإدراجات المجانية حتى تُصحَّح القيمة.
- المتاجر العربية تقع في أخطاء قليلة متكررة: توفّر مكتوب بالعربية («متوفر»)، وسعر فيه الريال نصاً («120 ر.س»)، وأسعار بالأرقام العربية المشرقية، وفاصلة للكسر العشري.
- رقم GTIN برقم تحقق خاطئ يُرفض وإن بدا صحيحاً للعين؛ وقد يربط المنتج بإدراج منتج آخر.

## كيف تُصلح

اكتب القيم التي تذكرها المواصفات، أياً كانت لغة المتجر:

```xml
<g:availability>in_stock</g:availability>
<g:price>120.00 SAR</g:price>
<g:sale_price>99.00 SAR</g:sale_price>
<g:link>https://shop.example/p/oud-1</g:link>
<g:gtin>4006381333931</g:gtin>
```

- التوفّر: اربط حالات المتجر بـ `in_stock` أو `out_of_stock` أو `preorder` أو `backorder` في إضافة الملف؛ لا تصدّر النص الذي يراه المتسوّق.
- السعر: الرقم بنقطة ثم مسافة ثم الرمز من ثلاثة أحرف: `SAR` و`AED` و`OMR` و`KWD` و`BHD` و`QAR` و`EGP`. وعملات الخليج ذات المنازل الثلاث (OMR وKWD وBHD) تبقى بها: `12.500 OMR`.
- سعر التخفيض: أقل من السعر وبالعملة نفسها.
- الروابط: عناوين كاملة تبدأ بـ `https://`.
- GTIN: انسخه من عبوة المنتج أو من المورّد؛ وإن لم يكن للمنتج فاترك السمة واجعل `identifier_exists` تساوي `no`.

## كيف نكشف

1. لكل منتج (أول 5000) نقرأ `availability` و`condition` و`price` و`sale_price` و`link` و`image_link` و`gtin`، ونوحّد المسافات والحالة: «In Stock» هي `in_stock`.
2. نحكم على السعر كما تكتبه المواصفات: أرقام ونقطة، ومسافة واحدة، ثم رمز ISO 4217. الأرقام العربية المشرقية والفاصلة وغياب الرمز ورمز ليس عملة ISO كلٌّ منها مشكلة قائمة بذاتها. ونقارن سعر التخفيض بالسعر حين يكونان بعملة واحدة.
3. الرابط مشكلة إن لم يكن عنواناً مطلقاً بـ `http` أو `https`، أو كان فيه مسافة.
4. الـ GTIN مشكلة إن كان فيه أرقام عربية مشرقية، أو طوله غير 8 و12 و13 و14، أو رقم التحقق لا يطابق قاعدة GS1 بمقياس 10.
5. نجمّع المشاكل بنوعها وقيمتها: نتيجة واحدة بعدد المنتجات وأولها.

لا نفحص أن الرابط يُفتح ولا أن التوفّر يطابق مخزون المتجر: لا نطلب غير ملف الخلاصة.

## المراجع

- [مركز مساعدة Google Merchant Center: التوفّر](https://support.google.com/merchants/answer/6324448)
- [مركز مساعدة Google Merchant Center: السعر](https://support.google.com/merchants/answer/6324371)
- [مركز مساعدة Google Merchant Center: GTIN](https://support.google.com/merchants/answer/6324461)
- [GS1: كيف يُحسب رقم التحقق](https://www.gs1.org/services/how-calculate-check-digit-manually)
- [رموز العملات ISO 4217](https://www.iso.org/iso-4217-currency-codes.html)
