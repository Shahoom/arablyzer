---
reviewed: false
---

# تاريخ تذكره الصفحة لا يُقرأ تاريخاً

## الرسائل

### not-iso

التاريخ في {source} («{value}») ليس بصيغة ISO 8601 مثل 2026-10-11 أو 2026-10-11T08:00:00+03:00.

### modified-before-published

تقول الصفحة إنها عُدّلت ({modified}) قبل أن تُنشر ({published}).

### header-invalid

ترويسة Last-Modified («{value}») ليست تاريخ HTTP مثل Sun, 11 Oct 2026 08:00:00 GMT.

## لماذا يهم

- يقرأ Google تاريخي نشر الصفحة وتعديلها من بياناتها المنظّمة ووسومها وترويساتها ويعرضهما في النتائج. والتاريخ الذي لا يستطيع تحليله يُسقطه، فتبدو الصفحة بلا تاريخ أو قديمة.
- الصفحات العربية تكتب التواريخ للناس: `١١‏/١٠‏/٢٠٢٦`، «11 أكتوبر 2026». وهذا صحيح في الصفحة وغير مقروء في وسم meta أو JSON-LD اللذين يريدان ISO 8601 بالأرقام 0–9.
- تعديل قبل النشر خطأ في البيانات، وغالباً قالب يطبع الحقل الخطأ.
- ترويسة `Last-Modified` الخاطئة تُبطل الطلبات الشرطية أو تُربك الذاكرات المؤقتة.

## كيف تُصلح

اطبع التاريخ من القيمة المخزّنة بصيغة ISO، والتاريخ المنسّق في الصفحة وحدها:

```html
<meta property="article:published_time" content="2026-03-05T08:00:00+03:00" />
<meta property="article:modified_time" content="2026-04-02" />
```

```json
"datePublished": "2026-03-05T08:00:00+03:00",
"dateModified": "2026-04-02"
```

- استعمل الأرقام 0–9 والشرطات: `YYYY-MM-DD`، مع وقت وإزاحة إن توفرا.
- اجعل تاريخ التعديل تاريخ آخر تغيير في المحتوى، ولا يسبق تاريخ النشر أبداً.
- دع الخادم يرسل `Last-Modified` تاريخ HTTP، أو لا يرسله.
- لا تغيّر تاريخ التعديل دون تغيير الصفحة: يتجاهل Google تواريخ لا يثق بها.

## كيف نكشف

1. نقرأ وسوم meta التي تعطي تاريخاً (`article:published_time` و`article:modified_time` و`og:updated_time` و`date` و`dcterms.date` و`dcterms.modified` و`last-modified`) وخصائص JSON-LD `datePublished` و`dateCreated` و`dateModified` و`priceValidUntil` و`validFrom` و`validThrough`.
2. يجب أن يكون التاريخ ISO 8601: يوماً موجوداً في التقويم، ومعه وقت وإزاحة اختيارياً. والأرقام العربية المشرقية والشرطات المائلة وأسماء الأشهر واليوم غير الموجود مرفوضة.
3. نقارن آخر تعديل بأول نشر.
4. يجب أن تكون ترويسة `Last-Modified` تاريخ HTTP (RFC 9110).

لا نحكم على قِدم التاريخ: لا شيء هنا يقول كم يجب أن تكون الصفحة حديثة. والتواريخ في النص الظاهر وفي عناصر `<time>` لا نقرؤها.

## المراجع

- [Google Search Central: التأثير في تاريخ النشر الظاهر في بحث Google](https://developers.google.com/search/docs/appearance/publication-dates)
- [ISO 8601 (مذكرة W3C لصيغ التاريخ والوقت)](https://www.w3.org/TR/NOTE-datetime)
- [RFC 9110: صيغ التاريخ والوقت](https://www.rfc-editor.org/rfc/rfc9110#name-date-time-formats)
