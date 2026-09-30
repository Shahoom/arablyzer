---
reviewed: false
---

# صيغة JSON-LD

صيغة JSON-LD طريقة لكتابة البيانات المترابطة بلغة JSON. في صفحات الويب تحمل البيانات المنظّمة داخل عنصر script، وهي الصيغة التي ينصح بها Google لذلك.

## التعريف

- JSON-LD 1.1 توصية من W3C صدرت في 2020، تعرّف صيغة مبنية على JSON للبيانات المترابطة (Linked Data). ومستند JSON-LD هو دائماً مستند JSON صالح.
- في HTML توضع في عنصر `<script type="application/ld+json">`: كتلة بيانات (data block) لا يشغّلها المتصفح ولا يراها الزائر، وتبقى لأدوات مثل محركات البحث تقرؤها.
- كلماتها المحجوزة تبدأ بالرمز `@`. فالكلمة `@context` تربط الأسماء القصيرة بمعرّفات كاملة: مع `"@context": "https://schema.org"` يصبح `name` خاصية الاسم في Schema.org. و`@type` تحدد نوع العنصر، و`@id` تسمّي العنصر ليشير إليه غيره، و`@graph` تجمع عدة عناصر في كتلة واحدة.

## لماذا يهم

- صيغ JSON-LD وMicrodata وRDFa سواء عند Google إذا كانت صحيحة، لكنه ينصح بصيغة JSON-LD لأنها الأسهل تطبيقاً وصيانة على نطاق واسع. وهي، خلافاً للصيغتين الأخريين، لا تتداخل مع النص الذي يراه الزائر، ويقرؤها Google حتى لو أضافها JavaScript إلى الصفحة.
- ولأنها JSON، فخطأ واحد في الصيغة، كفاصلة زائدة، يُفشل قراءة الكتلة كلها.
- النص العربي يُكتب كما هو: يسمح JSON بأي حرف من يونيكود داخل النص إلا علامة التنصيص والشرطة المائلة العكسية ورموز التحكم. فعلامتا التنصيص العربيتان «» لا تحتاجان إلى تهريب، أما `"` داخل اسم عربي فتحتاج.

## مثال

متجر وموقعه في كتلة واحدة: `@graph` يجمعهما، والموقع يشير إلى المتجر بمعرّفه `@id`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://example.com/#store",
      "name": "متجر «الواحة»",
      "url": "https://example.com/"
    },
    {
      "@type": "WebSite",
      "name": "متجر الواحة",
      "url": "https://example.com/",
      "publisher": { "@id": "https://example.com/#store" }
    }
  ]
}
</script>
```

## أخطاء شائعة

- فاصلة بعد آخر عنصر في كائن أو قائمة.
- علامة `"` أو سطر جديد داخل نص، تُركا كما هما: اكتبهما `\"` و`\n`.
- تعليقات مثل `//` داخل الكتلة، وJSON لا يعرف التعليقات.
- كتابة الكتلة يدوياً بدل توليدها بدالة ترميز JSON، مثل `JSON.stringify` أو `json_encode`.

## المراجع

- [W3C: JSON-LD 1.1](https://www.w3.org/TR/json-ld11/) (بالإنجليزية)
- [موقع JSON-LD.org](https://json-ld.org/) (بالإنجليزية)
- [Google Search Central: مقدمة عن آلية عمل ترميز البيانات المنظَّمة في بحث Google](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=ar)
- [IETF: RFC 8259، صيغة تبادل البيانات JSON](https://www.rfc-editor.org/rfc/rfc8259) (بالإنجليزية)
- [مواصفة HTML: عنصر script](https://html.spec.whatwg.org/multipage/scripting.html#the-script-element) (بالإنجليزية)
