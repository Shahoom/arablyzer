---
reviewed: false
---

# قائمة hreflang بلا x-default

## الرسائل

### missing

تُدرج الصفحة {count} نسخ في hreflang بلا `x-default`، عنوان زوار كل لغة أو منطقة أخرى.

## لماذا يهم

- يخبر `x-default` محرك Google بالنسخة التي يعرضها لزائر لا تناسبه لغته أو بلده أيٌّ من النسخ المدرجة: زائر من مصر إلى متجر يدرج ar-SA وar-AE فقط.
- يصفه Google بأنه موصى به لا مطلوب، فالقاعدة بسيطة: بدونه يختار Google نسخة بنفسه.
- هو عادةً صفحة اختيار اللغة أو النسخة المقصودة لكل من عداهم.

## كيف تُصلح

أضف رابط `x-default` واحداً إلى القائمة نفسها في كل نسخة، يشير إلى الصفحة المقصودة لكل من عداهم:

```html
<link rel="alternate" hreflang="en" href="https://shop.example/en/offers" />
<link rel="alternate" hreflang="x-default" href="https://shop.example/offers" />
```

وإن كان لمتجرك نسخة واحدة للعالم كله (متجر عربي بصفحة واحدة) فلا تحتاج هذا كله: hreflang لصفحات لها أكثر من نسخة.

## كيف نكشف

1. نقرأ عناصر `<link rel="alternate" hreflang>` في الصفحة وترويسات Link.
2. إذا أدرجت رمزين مختلفين فأكثر (بغير `x-default`) وليس بينها `x-default` بأي حالة أحرف، فالصفحة تنقصها.

## المراجع

- [Google Search Central: النسخ المحلية لصفحاتك](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [مدونة Google Search Central: x-default في hreflang للصفحات الدولية](https://developers.google.com/search/blog/2013/04/x-default-hreflang-for-international-pages)
