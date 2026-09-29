---
reviewed: false
summary: هل يستخدم CSS صفحتك margin-left بدل margin-inline-start؟
---

# فحص CSS المنطقي

يعرض صفحتك العربية ويقرأ ملفات CSS التي حمّلتها، ويعدّ الخصائص التي تثبّت الجهات على اليسار واليمين، مثل margin-left، بدل الخصائص المنطقية التي تتبع اتجاه الصفحة.

## ماذا تفحص

- ملفات CSS التي حمّلها المتصفح لصفحة اتجاهها من اليمين إلى اليسار، وعناصر `<style>` فيها.
- الخصائص التي تحدد الجهة باليمين أو اليسار: `margin-left` و`padding-right` و`border-left` و`left` و`right` وزوايا `border-radius`.
- القيمتان `left` و`right` في `float` و`clear` و`text-align`.
- ما كُتب لاتجاه واحد عن قصد لا يُحسب: قواعد `[dir="rtl"]` و`:dir(rtl)` و`.rtl` و`:lang(ar)`، والملفات التي في اسمها `rtl`.

## مثال

### خطأ

```html
ul.menu {
  padding-left: 0;
  list-style: none;
}
.menu li {
  float: left;
  margin-right: 16px;
}
```

### صحيح

```html
ul.menu {
  padding-inline-start: 0;
  list-style: none;
}
.menu li {
  float: inline-start;
  margin-inline-end: 16px;
}
```

## كيف تُصلح

استخدم الخصائص المنطقية، التي تتبع اتجاه الصفحة: الخاصية `margin-inline-start` تضع المسافة على اليمين في الصفحة العربية، وعلى اليسار في الصفحة الإنجليزية.

```html
<style>
  .card {
    margin-inline-start: 16px;
    padding-inline-end: 8px;
    border-inline-start: 4px solid;
    text-align: start;
  }
</style>
```

| بدل | استخدم |
|---|---|
| `margin-left` و`margin-right` | `margin-inline-start` و`margin-inline-end` |
| `padding-left` و`padding-right` | `padding-inline-start` و`padding-inline-end` |
| `border-left` و`border-right` | `border-inline-start` و`border-inline-end` |
| `left` و`right` | `inset-inline-start` و`inset-inline-end` |
| `border-top-left-radius` | `border-start-start-radius` |
| `text-align: left` و`text-align: right` | `text-align: start` و`text-align: end` |
| `float: left` و`float: right` | `float: inline-start` و`float: inline-end` |

- في Tailwind CSS استخدم الأصناف المنطقية: `ms-4` و`me-4` بدل `ml-4` و`mr-4`، و`ps-4` و`pe-4` بدل `pl-4` و`pr-4`، و`start-0` و`end-0` بدل `left-0` و`right-0`، و`text-start` بدل `text-left`.
- وفي Bootstrap، استخدم الملف `bootstrap.rtl.min.css` في الصفحات العربية.

## أسئلة شائعة

### هل يجب أن أعيد كتابة كل CSS بالخصائص المنطقية؟

لا. هذه الأداة للعلم فقط، ولا تنقص من الدرجة: الخصائص المادية تصلح إذا كُتبت لهذا الاتجاه عن قصد. لكن الخصائص المنطقية تجعل ملفاً واحداً يصلح للاتجاهين، بدل ملف ثانٍ للعربية يُنسى تحديثه.

### لماذا لا يزيل `padding-left: 0` مسافة القائمة في الصفحة العربية؟

لأن المتصفح يضع مسافة القائمة في بداية السطر، وبداية السطر في الصفحة العربية على اليمين. فالخاصية `padding-left` تزيل مسافة ليست موجودة، وتبقى المسافة التي على اليمين. استخدم `padding-inline-start: 0`.

### ماذا لو كان لموقعي ملف CSS خاص بالعربية؟

عندئذ تكون الخصائص المادية فيه مقصودة، كما في الملف الذي تولّده أداة RTLCSS أو الملف `bootstrap.rtl.min.css`. لا نحسب الملفات التي في اسمها `rtl`، ولا القواعد المكتوبة لاتجاه أو لغة بعينها، مثل `[dir="rtl"]` و`:lang(ar)`، ولا الكتل التي تحدد اتجاهها بالخاصية `direction`.

## المنهجية

نعرض الصفحة في Chromium وFirefox وWebKit بأداة Playwright، وكل محرّك خلف بروكسي الخروج في Arablyzer. إذا كان اتجاه الصفحة من اليمين إلى اليسار، نقرأ ملفات CSS التي حمّلها المتصفح وعناصر `<style>` فيها، ونعدّ في كل ملف الخصائص التي تحدد الجهة باليمين أو اليسار. ونترك القواعد المكتوبة لاتجاه أو لغة بعينها، والكتل التي تحدد اتجاهها بالخاصية `direction`، والخاصيتين المتقابلتين إذا كانت قيمتهما واحدة (`left: 0; right: 0`)، والحركات في `@keyframes`، والملفات التي في اسمها `rtl`. نذكر كل ملف مرة واحدة، بعدد خصائصه وأولها، وتُحسب عناصر `<style>` في الصفحة ملفاً واحداً. لا نقرأ ملفاً لم نعرف حجمه قبل قراءته، ولا ملفاً أكبر من الحد؛ وFirefox وWebKit يخفيان حجم ملف CSS من موقع آخر، فلا نقرؤه فيهما. النتيجة للعلم ولا تنقص من الدرجة، وتعطي الصفحة نفسها النتيجة نفسها في كل فحص.
