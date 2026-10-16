---
reviewed: false
---

# بيانات النشاط التجاري ناقصة أو مكتوبة بصيغ عربية لا يقرؤها Schema.org

## الرسائل

### no-name

النشاط التجاري في كتلة JSON-LD رقم {block} (السطر {line}) بلا `name`.

### no-address

النشاط التجاري في كتلة JSON-LD رقم {block} (السطر {line}) بلا `address` فيه شارع أو منطقة أو إقليم أو رمز بريدي.

### telephone-arabic-digits

`telephone` في كتلة JSON-LD رقم {block} (السطر {line}) مكتوب بأرقام عربية مشرقية («{telephone}»)؛ استعمل الأرقام 0–9.

### telephone-no-country

`telephone` في كتلة JSON-LD رقم {block} (السطر {line}) بلا رمز دولة («{telephone}»)؛ اكتبه هكذا +968 9123 4567.

### hours-invalid

`{property}` في كتلة JSON-LD رقم {block} (السطر {line}) هو «{value}» ولا يقرؤه Schema.org: يريد أسماء الأيام بالإنجليزية والأوقات بنظام 24 ساعة بالأرقام 0–9.

### geo-invalid

`{property}` في إحداثيات كتلة JSON-LD رقم {block} (السطر {line}) هو «{value}»، وليس رقماً بالأرقام 0–9 ونقطة.

## لماذا يهم

- يستخدم Google بيانات النشاط التجاري ليعرض اسمه وعنوانه وهاتفه وأوقاته في نتائج البحث وعلى الخريطة. ويشترط الاسم والعنوان؛ وبدونهما لا يستفيد النشاط من البيانات.
- العربية سبب بقية الأخطاء عادةً: الأيام مكتوبة «السبت»، والأوقات «9:00 ص»، والهاتف والإحداثيات بأرقام عربية مشرقية. تُقرأ جيداً في الصفحة ولا تقول لـ Google شيئاً، فتكون الأوقات في البحث خاطئة أو فارغة.
- الهاتف بلا رمز دولته يُقرأ رقماً محلياً لا يُطلب إلا من داخل الدولة؛ ومن زائر خارجها أو من الخريطة يفشل.

## كيف تُصلح

اكتب البيانات كما يكتبها Schema.org وإن عرضتها الصفحة بالعربية:

```json
"telephone": "+96891234567",
"openingHoursSpecification": {
  "@type": "OpeningHoursSpecification",
  "dayOfWeek": ["Saturday", "Sunday"],
  "opens": "09:00",
  "closes": "21:00"
}
```

- الأيام: من `Monday` إلى `Sunday` (أو `https://schema.org/Monday`) بالإنجليزية أياً كانت لغة الصفحة.
- الأوقات: نظام 24 ساعة، `09:00` و`21:00`.
- الهاتف: `+` ثم رمز الدولة ثم الرقم بالأرقام 0–9: سعودي `+966 50 123 4567` وعُماني `+968 9123 4567`.
- الإحداثيات: أرقام مثل `23.588` بنقطة.
- أعطِ الاسم بلغتين بـ `"name": [{"@language": "ar", "@value": "متجر الواحة"}, {"@language": "en", "@value": "Al Waha Store"}]` إن أردت أن يُعرف النشاط بهما.

## كيف نكشف

1. نقرأ كتل JSON-LD التي تُحلَّل ونجد LocalBusiness وأنواعه الشائعة (Store وRestaurant وCafeOrCoffeeShop وPharmacy وMedicalClinic وHotel وغيرها مما يذكره Schema.org) في أعلى الكتلة أو في `@graph`.
2. يحتاج النشاط `name`، و`address` نصاً أو فيه شارع أو منطقة أو إقليم أو رمز بريدي.
3. نذكر `telephone` إن كان بأرقام عربية مشرقية، أو لا يبدأ بـ `+` أو `00`.
4. في `openingHoursSpecification` يجب أن يكون `dayOfWeek` من أسماء الأيام الإنجليزية في Schema.org (أو PublicHolidays)، وأن تكون `opens` و`closes` بنظام 24 ساعة؛ وفي `openingHours` نذكر أي حرف عربي.
5. يجب أن تكون خطوط `geo` للعرض والطول أرقاماً، أو نصاً من الأرقام 0–9 ونقطة.

## المراجع

- [Google Search Central: بيانات النشاط التجاري المحلي المنظّمة](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Schema.org: LocalBusiness](https://schema.org/LocalBusiness)
- [Schema.org: OpeningHoursSpecification](https://schema.org/OpeningHoursSpecification)
