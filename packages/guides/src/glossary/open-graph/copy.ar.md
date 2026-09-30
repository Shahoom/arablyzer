---
reviewed: false
---

# وسوم المشاركة (Open Graph)

وسوم Open Graph مجموعة وسوم meta، مثل og:title وog:image، تقرؤها تطبيقات مثل واتساب وفيسبوك لتبني معاينة الرابط حين يُشارك.

## التعريف

- بروتوكول Open Graph، الذي أُنشئ أصلاً في فيسبوك، يصف الصفحة عنصراً له عنوان ونوع وصورة ورابط. ووسومه عناصر `<meta>` في `<head>` الصفحة، لكل منها سمة `property` مثل `og:title`، وسمة `content`.
- يذكر موقع ogp.me أربع خصائص تحتاجها كل صفحة: `og:title` و`og:type` و`og:image` و`og:url`. ومن الخصائص الاختيارية `og:description` و`og:site_name` و`og:locale`، و`og:image:alt` لوصف الصورة.

## لماذا يهم

- يظهر الرابط المشارَك معاينةً فيها عنوان ووصف وصورة، تؤخذ من هذه الوسوم. وإذا غابت خمّن زاحف فيسبوك ما يعرضه من محتوى الصفحة.
- يطلب واتساب أن تكون `og:title` و`og:description` و`og:url` داخل `<head>` وغير فارغة، وأن تكون `og:image` رابطاً كاملاً لصورة حجمها أقل من 600KB، وعرضها 300 بكسل على الأقل، ولا يزيد على أربعة أضعاف ارتفاعها. ويجب أن يقع `<head>` ضمن أول 300KB من HTML.
- في الصفحات العربية: القيمة الافتراضية لوسم `og:locale` هي `en_US`، فأعلن لغة الصفحة. وتستخدم Meta الرمز `ar_AR` للعربية عموماً.

## مثال

وسوم صفحة منتج عربية، ونسختها الإنجليزية لغةً بديلة:

```html
<meta property="og:title" content="عسل السدر العماني">
<meta property="og:description" content="عسل سدر عماني طبيعي، في عبوات من نصف كيلو.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://example.com/sidr-honey">
<meta property="og:image" content="https://example.com/images/sidr-honey.jpg">
<meta property="og:image:alt" content="عبوة عسل سدر على طاولة خشبية">
<meta property="og:site_name" content="متجر الواحة">
<meta property="og:locale" content="ar_AR">
<meta property="og:locale:alternate" content="en_US">
```

## أخطاء شائعة

- مسار نسبي للصورة، مثل `/images/honey.jpg`، وواتساب يطلب رابطاً كاملاً.
- صورة جديدة برابط الصورة القديمة: يخزّن فيسبوك الصور حسب روابطها، ولا يحدّثها إلا إذا تغيّر الرابط.
- اسم الموقع في `og:title`: تطلب Meta وواتساب العنوان بلا اسم العلامة، وللاسم وسم `og:site_name`.
- أنماط أو سكربتات كبيرة مضمّنة قبل الوسوم، قد تدفعها خارج أول 300KB من HTML، حيث يطلبها واتساب.

## المراجع

- [بروتوكول Open Graph](https://ogp.me/) (بالإنجليزية)
- [Meta للمطوّرين: المشاركة للمشرفين على المواقع](https://developers.facebook.com/docs/sharing/webmasters/) (بالإنجليزية)
- [Meta للمطوّرين: معاينة الروابط في واتساب](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/) (بالإنجليزية)
- [Meta للمطوّرين: اللغات المدعومة](https://developers.facebook.com/docs/javascript/internationalization) (بالإنجليزية)
