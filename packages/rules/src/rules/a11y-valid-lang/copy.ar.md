---
reviewed: false
---

# خاصية lang لا تسمّي لغة

## الرسائل

### invalid

خاصية `lang` في هذا العنصر ليست رمز لغة، فلا يستطيع قارئ الشاشة التحوّل إلى الصوت المناسب له.

## لماذا يهم

- يختار قارئ الشاشة الصوت والنطق بحسب `lang`: الاسم الإنجليزي داخل نص عربي، إذا عُلِّم بـ`lang="en"`، يُقرأ بنطق إنجليزي. أما قيمة مثل `lang="english"` أو `lang="arabic"` فليست رمز لغة، فلا يتغير شيء.
- تطلب WCAG 2.2 أن تُعرف لغة كل مقطع مكتوب بلغة أخرى (المعيار 3.1.2، المستوى AA).

## كيف تُصلح

- استخدم رمز اللغة (BCP 47): `ar` للعربية و`en` للإنجليزية، ومعه البلد إن احتجت، مثل `ar-OM` أو `en-GB`: `<span lang="en">Apple Pay</span>`.

## كيف نكشف

1. نعرض الصفحة ونشغّل قاعدة `valid-lang` في axe-core 4.13.0 في كل محرّك.
2. تبلّغ عن كل عنصر داخل الصفحة، غير `<html>` نفسه، لا تبدأ قيمة `lang` فيه برمز لغة معروف. ولغة `<html>` تفحصها قاعدة ar-html-lang.
3. لا تنطبق على الصفحات التي ليس داخلها خاصية `lang`.

## المراجع

- [W3C: شرح WCAG 2.2، لغة أجزاء الصفحة (3.1.2)](https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html) (بالإنجليزية)
- [W3C: إعلان اللغة في HTML](https://www.w3.org/International/questions/qa-html-language-declarations) (بالإنجليزية)
- [axe-core: القاعدة valid-lang](https://dequeuniversity.com/rules/axe/4.13/valid-lang) (بالإنجليزية)
