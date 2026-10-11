---
reviewed: false
---

# حقل في نموذج بلا رمز autocomplete

## الرسائل

### missing

الحقل «{field}» يطلب ما يستطيع المتصفح ملأه، لكن لا `autocomplete` فيه يقول ما هو؛ أضف `autocomplete="{token}"`.

## لماذا يهم

- مع `autocomplete` الصحيح يملأ المتصفح أو مدير كلمات المرور الاسم والهاتف والبريد والعنوان في إتمام الطلب من بيانات العميل المحفوظة: لمسات قليلة على الجوال بدل كتابة عنوان على لوحة مفاتيح عربية.
- يطلبه WCAG 2.2 للحقول التي تجمع بيانات المستخدم نفسه (المعيار 1.3.5 تحديد غرض الحقل، المستوى AA): ويتيح للتقنيات المساعدة إظهار رمز لغرض الحقل.
- `autocomplete="off"` على هذه الحقول يزيل المساعدة، والمتصفحات كثيراً ما تتجاهله في العناوين على كل حال.
- أخطاء كتابة أقل وطلبات متروكة أقل: هذا أرخص إصلاح لإتمام الطلب.

## كيف تُصلح

سمِّ غرض كل حقل برمز من معيار HTML:

```html
<input id="name" name="full_name" autocomplete="name" />
<input id="email" name="email" type="email" autocomplete="email" />
<input id="phone" name="phone" type="tel" autocomplete="tel" dir="ltr" />
<input id="city" name="city" autocomplete="address-level2" />
<input id="street" name="street" autocomplete="street-address" />
<input id="zip" name="zip" autocomplete="postal-code" />
```

- استعمل `shipping` أو `billing` قبل الرمز إن كان في الصفحة الاثنان: `autocomplete="shipping street-address"`.
- احذف `autocomplete="off"` من هذه الحقول.
- في قالب منصة المتجر يضبطها قالب إتمام الطلب؛ وعادةً يكفي تحديث القالب أو إعدادات إتمام الطلب.

## كيف نكشف

1. نجد الحقول التي غرضها واضح: `type="email"` أو `type="tel"`، أو اسم أو معرّف أو تسمية تقول الاسم أو البريد أو الهاتف أو المدينة أو الشارع أو الرمز البريدي (بالعربية أو الإنجليزية). ونستبعد حقول اسم المستخدم والشركة وحامل البطاقة والكوبون.
2. نُخفق الحقل إن كان `autocomplete` غائباً أو فارغاً أو `off`. وأي رمز غير ذلك يُقبل: لا نتحقق أنه الرمز الصحيح.

## المراجع

- [W3C: فهم معيار النجاح 1.3.5 تحديد غرض الحقل](https://www.w3.org/WAI/WCAG22/Understanding/identify-input-purpose.html)
- [معيار HTML: الملء التلقائي](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill)
- [MDN: خاصية autocomplete](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete)
