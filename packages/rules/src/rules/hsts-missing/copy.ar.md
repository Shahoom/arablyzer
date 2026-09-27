---
reviewed: false
---

# HTTPS بلا HSTS

## الرسائل

### missing

هذه الصفحة على HTTPS لكنها لا ترسل الترويسة `Strict-Transport-Security`، فلا يعرف المتصفح أن عليه استخدام HTTPS وحده لهذا الموقع: من يكتب العنوان أو يتبع رابط `http:` قد يصلها أولاً عبر HTTP.

### zero

الترويسة `Strict-Transport-Security` فيها `max-age=0`، وهذا يطلب من المتصفح أن ينسى أن الموقع على HTTPS.

### invalid

الترويسة `Strict-Transport-Security` غير صالحة (`{value}`)، فيتجاهلها المتصفح.

## لماذا يهم

- الزائر الذي يكتب اسم الموقع دون `https://`، أو يتبع رابطاً قديماً يبدأ بـ `http:`، يرسل طلبه الأول عبر HTTP قبل أن يحوّله الموقع. في تلك اللحظة يستطيع من في الطريق أن يبقيه على HTTP ويقرأ ما يرسله.
- الترويسة `Strict-Transport-Security` (HSTS) تخبر المتصفح أن يستخدم HTTPS وحده لهذا الموقع مدة `max-age` بالثواني، فلا يمر طلب بعد ذلك عبر HTTP.
- بعض المتصفحات صارت تجرّب HTTPS أولاً من نفسها (Chrome يفعل)، والموقع المدرج في قائمة HSTS المسبقة (preload) محمي من أول زيارة في المتصفحات التي تحمل القائمة. لكن الترويسة هي ما يخبر كل المتصفحات، والقائمة نفسها تشترطها.

## كيف تُصلح

أرسل الترويسة في ردود HTTPS، لمدة سنة مثلاً:

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

- `includeSubDomains` يشمل النطاقات الفرعية، فأضفه بعد أن تتأكد أنها كلها تعمل على HTTPS، أو ابدأ بمدة قصيرة وزدها.
- وقائمة HSTS preload تضيف موقعك إلى المتصفحات نفسها، فتصل حتى الزيارة الأولى عبر HTTPS. شروطها في موقعها.

## كيف نكشف

1. نقرأ أول ترويسة `Strict-Transport-Security` في رد الصفحة، فالمتصفح يقرأ الأولى وحدها.
2. تفشل القاعدة إذا لم تكن موجودة، أو كانت `max-age` فيها صفراً، أو خالفت قواعد كتابة الترويسة (RFC 6797) فتجاهلها المتصفح: كأن تغيب عنها `max-age`، أو تتكرر `max-age` أو `includeSubDomains`، أو تأخذ `includeSubDomains` قيمة، أو تُفتح علامة تنصيص ولا تُغلق.
3. نستثني الصفحات على HTTP، والعناوين الرقمية (IP)، لأن المتصفحات لا تحفظ HSTS لها.

## المراجع

- [IETF: RFC 6797، HTTP Strict Transport Security](https://www.rfc-editor.org/rfc/rfc6797) (بالإنجليزية)
- [MDN: الترويسة Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security) (بالإنجليزية)
- [قائمة HSTS preload](https://hstspreload.org/) (بالإنجليزية)
