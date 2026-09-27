---
reviewed: false
---

# صور بصيغ قديمة

## الرسائل

### legacy

الصورة {url} بصيغة {format} وحجمها {size} KB. بصيغة AVIF يُقدَّر حجمها بنحو {avif} KB.

## لماذا يهم

- AVIF وWebP أحدث من JPEG وPNG، وتحفظان الصورة نفسها بحجم أصغر بكثير.
- كل المتصفحات الحالية تعرضهما: Chrome وFirefox وSafari وEdge.
- والصور كثيراً ما تكون أثقل ما في الصفحة، فتصغيرها من أسرع طرق تسريعها.

## كيف تُصلح

حوّل الصور إلى AVIF أو WebP، بأداة مثل Squoosh أو بخدمة الصور في شبكة توزيع المحتوى، واعرضها بـ `<picture>` مع بديل للمتصفحات القديمة:

```html
<picture>
  <source srcset="sadu.avif" type="image/avif" />
  <source srcset="sadu.webp" type="image/webp" />
  <img src="sadu.jpg" width="128" height="128" alt="نقش سدو" />
</picture>
```

- الأيقونات والرسوم البسيطة تصلح لها SVG.

## كيف نكشف

1. نعرض الصفحة ونقرأ الصور التي رسمها المتصفح، وصيغة كل ملف وحجمه وأبعاده بالبكسل (أبعاد الملف نفسه، لا الحجم الذي يُعرض به).
2. للصورة بصيغة JPEG أو PNG أو BMP، نقدّر حجمها بصيغة AVIF من عدد بكسلاتها: بايتان لكل بكسل، مضغوطة 12 مرة. كان Lighthouse 12 يعيد ترميز كل صورة في Chrome ويقدّر AVIF من تلك الأحجام، ولا يستعمل هذا التقدير إلا لصورة لم يستطع ترميزها؛ ونحن نستعمله لكل صورة وفي كل محرّك. ونترك GIF كما تركه Lighthouse 12.
3. تفشل القاعدة إذا زاد حجم الملف على ذلك التقدير بـ 8,192 بايت أو أكثر، وهو حد Lighthouse 12 نفسه.
4. نذكر كل صورة مرة واحدة، عند أول عنصر يعرضها.

## المراجع

- [MDN: صيغ الصور](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types) (بالإنجليزية)
- [Chrome: اعرض الصور بصيغ حديثة](https://developer.chrome.com/docs/lighthouse/performance/uses-webp-images) (بالإنجليزية)
- [MDN: العنصر picture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/picture) (بالإنجليزية)
