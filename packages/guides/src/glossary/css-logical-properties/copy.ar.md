---
reviewed: false
---

# الخصائص المنطقية في CSS (logical properties)

الخصائص المنطقية في CSS تحدد الجهات باتجاه سير النص، بالبداية والنهاية بدل اليسار واليمين، فيخدم ملف أنماط واحد الصفحات العربية والإنجليزية معاً.

## التعريف

- الخصائص والقيم المنطقية، من وحدة الخصائص المنطقية في CSS لدى W3C، تسمّي الجهات والمقاسات باتجاه سير النص لا بجهات الشاشة: المحور السطري (inline) يسير مع السطر، والمحور الكتلي (block) يعبر الأسطر، ولكل منهما بداية ونهاية.
- في الصفحة الأفقية تكون `inline-start` حيث تبدأ الأسطر: اليسار في الإنجليزية، واليمين في العربية. فالخاصية `margin-inline-start` هي الهامش الأيسر في الصفحة الإنجليزية، والأيمن في العربية.
- وللخصائص المادية مقابلات منطقية، مثل `padding-inline-end` مقابل `padding-right` في الإنجليزية، و`inset-inline-start` مقابل `left`، و`inline-size` مقابل `width`. ومعها قيم منطقية: `text-align: start` و`float: inline-start` و`clear: inline-end`.

## لماذا يهم

- القالب الذي يستخدم `margin-left` و`float: left` يُبقي هذه الجهات حين تصير الصفحة من اليمين إلى اليسار، فتبقى المسافات والمحاذاة والعناصر العائمة حيث وضعها التصميم الإنجليزي.
- ومثال شائع: `ul { padding-left: 0 }` لا يزيل مسافة القائمة في الصفحة العربية، لأن المتصفح يضعها في بداية السطر، على اليمين.
- مع الخصائص المنطقية يخدم ملف أنماط واحد الاتجاهين، بدل ملف ثانٍ للعربية يُنسى تحديثه.

## مثال

قاعدة واحدة بدل قاعدتين:

```css
/* قبل */
.card { margin-left: 1rem; text-align: left; }
[dir="rtl"] .card { margin-left: 0; margin-right: 1rem; text-align: right; }

/* بعد */
.card { margin-inline-start: 1rem; text-align: start; }
```

## أخطاء شائعة

- تحويل الهوامش والحشوات وحدها: `text-align` و`float` والموضعان `left` و`right` وزوايا `border-radius` لها صيغ منطقية أيضاً.
- الاختصارات ذات القيم الأربع مادية: `padding: 0 1rem 0 0` يحدد الأعلى واليمين والأسفل واليسار. وللبداية والنهاية استخدم `padding-inline: 0 1rem`.
- في Tailwind CSS، كتابة `ml-4` و`pl-4` و`text-left` بدل الأصناف المنطقية `ms-4` و`ps-4` و`text-start`.

## المراجع

- [W3C: وحدة الخصائص والقيم المنطقية في CSS، المستوى 1](https://www.w3.org/TR/css-logical-1/) (بالإنجليزية)
- [MDN: الخصائص والقيم المنطقية في CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Logical_properties_and_values) (بالإنجليزية)
- [MDN: الخاصية padding-inline](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/padding-inline) (بالإنجليزية)
