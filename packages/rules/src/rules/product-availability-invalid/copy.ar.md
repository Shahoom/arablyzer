---
reviewed: false
---

# توفّر المنتج في البيانات المنظّمة ليس قيمة من Schema.org

## الرسائل

### text

العرض في كتلة JSON-LD رقم {block} (السطر {line}) يعطي التوفّر «{availability}» وهو كلمة لا قيمة من Schema.org؛ اكتب عنوان قيمة منها، مثل `https://schema.org/InStock`.

### unknown

العرض في كتلة JSON-LD رقم {block} (السطر {line}) يعطي التوفّر «{availability}» وهو ليس من قيم التوفّر في Schema.org؛ راجع تهجئته.

## لماذا يهم

- يقرأ Google مخزون العرض من `availability`. والكلمة بلغة المتجر («متوفر»، "in stock") تُفهم الإنسان ولا تُفهم Google شيئاً، فلا تظهر حالة المخزون للمنتج، أو يُستبعد من قوائم تحتاجها.
- يجب أن تكون القيمة إحدى قيم `ItemAvailability` في Schema.org مكتوبةً عنوانها: `https://schema.org/InStock` و`OutOfStock` و`PreOrder` و`BackOrder` و`SoldOut` وغيرها. وحالة الأحرف مهمة: `InStock` لا `Instock`.
- القوالب التي تطبع تسمية المتجر في البيانات تفعل ذلك بصمت، فتبدو الصفحة سليمة.

## كيف تُصلح

اربط حالات المتجر بقيم Schema.org واكتب كل واحدة عنوانها:

```json
"availability": "https://schema.org/InStock"
```

- متوفر: `https://schema.org/InStock`؛ غير متوفر: `https://schema.org/OutOfStock`.
- يُطلب قبل وصوله: `https://schema.org/PreOrder`؛ يتوفر بعد انتظار: `https://schema.org/BackOrder`.
- أصلحه في قالب القالب أو إعدادات تطبيق الـ SEO للمنتج، حيث تُصنع البيانات، لا في نص المنتج.

## كيف نكشف

1. نقرأ كل عرض لمنتج في JSON-LD في الصفحة (والعرض المعطى بـ `@id` يُقرأ من تعريفه) و`availability` الذي يعطيه.
2. تُقبل القيمة إن كانت من قيم ItemAvailability في Schema.org: بعنوان `https://schema.org/` أو `http://schema.org/` أو بـ `schema:` أو مجردة.
3. القيمة التي تبدأ بعنوان schema.org ولا توجد في القائمة `unknown`؛ وما سواها `text`. والقيم الفارغة والعروض بلا توفّر لا يُحكم عليها.

## المراجع

- [Schema.org: ItemAvailability](https://schema.org/ItemAvailability)
- [Google Search Central: بيانات المنتج المنظّمة](https://developers.google.com/search/docs/appearance/structured-data/product)
